import type { Env } from "./index";
import { SsrfBlockedError } from "./ssrf";
import { cleanHtmlToText } from "./htmlClean";
import { isKnownSharedDomain } from "./sharedDomains";
import { runExtraction, fetchPolicyText } from "./check";
import { sendAlert } from "./alert";
import { cleanText } from "./textUtil";

const STUCK_THRESHOLD_MINUTES = 30;
// The cron fires every 15 minutes, so a row crosses the 30-minute mark in
// exactly one run's window. The window is 16 minutes, not 15, so scheduler
// jitter can only cause an occasional duplicate alert, never a missed one.
// Pages that produce no text (client-rendered sites) fail the same way every
// time and would page Elliot for something no one can fix; they stay in the
// logged list above but don't alert.
// This is what lets alerting be stateless (no table, no migration): each
// stuck row alerts about once, instead of every 15 minutes until fixed.
const ALERT_WINDOW_MINUTES = 16;
const MAX_ROWS_IN_ALERT = 10;

interface StuckRow {
  id: number;
  domain: string;
  created_at: string;
  extraction_error: string | null;
}

export function formatStuckAlert(rows: StuckRow[]): string {
  const shown = rows.slice(0, MAX_ROWS_IN_ALERT).map((r) => {
    // The stored reason can carry text derived from a fetched page or an API
    // error body, so clean it and keep it short. Telegram may auto-link it.
    const reason = cleanText(r.extraction_error, 120);
    const why = reason ? ` -- ${reason}` : "";
    return `#${r.id} ${r.domain} (since ${r.created_at})${why}`;
  });
  const more = rows.length > MAX_ROWS_IN_ALERT ? `\n...and ${rows.length - MAX_ROWS_IN_ALERT} more` : "";
  return `PolicyPeek: ${rows.length} check(s) stuck in pending for over ${STUCK_THRESHOLD_MINUTES} minutes.\n${shown.join("\n")}${more}`;
}

// Flags jobs that never made it out of "pending" (extraction never ran or
// never finished). Everything stuck is logged (visible with Workers Logs on);
// rows that only just crossed the threshold also push an alert to Elliot, so
// an outage like the 3-day ANTHROPIC_API_KEY one can't go unnoticed. No
// auto-retry or remediation.
export async function checkStuckPending(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, domain, created_at, extraction_error FROM pending_checks
     WHERE status = 'pending'
       AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
  )
    .bind(`-${STUCK_THRESHOLD_MINUTES} minutes`)
    .all<StuckRow>();

  if (results.length === 0) return;

  console.warn(
    `[cron] ${results.length} pending_checks stuck past ${STUCK_THRESHOLD_MINUTES}m:`,
    results.map((r) => `#${r.id} ${r.domain} (since ${r.created_at})`).join("; ")
  );

  const { results: newlyStuck } = await env.DB.prepare(
    `SELECT id, domain, created_at, extraction_error FROM pending_checks
     WHERE status = 'pending'
       AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
       AND (extraction_error IS NULL OR extraction_error NOT LIKE 'empty_extracted_text%')`
  )
    .bind(`-${STUCK_THRESHOLD_MINUTES} minutes`, `-${STUCK_THRESHOLD_MINUTES + ALERT_WINDOW_MINUTES} minutes`)
    .all<StuckRow>();

  if (newlyStuck.length > 0) {
    await sendAlert(env, formatStuckAlert(newlyStuck));
  }
}

interface PublishedToolRow {
  id: number;
  domain: string;
  source_urls: string;
}

// Tier C of the three-tier publish model (see autoPublish.ts): the catalog
// is built on the assumption that a privacy policy page rarely changes, but
// "rarely" isn't "never" -- and the pipeline itself can get it wrong even
// when the vendor's page hasn't moved (wrong source URL, empty extraction).
// This re-runs every published tool through the same fetch -> extract ->
// evaluateAutoPublish path as a fresh submission. Unchanged verdicts
// silently re-confirm (auto-published, nothing for anyone to see); a
// changed verdict always lands in the admin queue instead of overwriting
// the live badge on its own -- see evaluateAutoPublish's isRecheck branch.
export async function runMonthlyRecheck(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT id, domain, source_urls FROM tools WHERE verified = 1"
  ).all<PublishedToolRow>();

  let ok = 0;
  let failed = 0;

  for (const tool of results) {
    const sourceUrl = (JSON.parse(tool.source_urls || "[]") as string[])[0];
    if (!sourceUrl) continue;

    try {
      const fetched = await fetchPolicyText(sourceUrl, tool.domain);
      const cleanedText = cleanHtmlToText(fetched.rawHtml);
      const sharedDomain = isKnownSharedDomain(tool.domain);

      const inserted = await env.DB.prepare(
        `INSERT INTO pending_checks (domain, is_recheck, source_url, raw_fetch, status, shared_domain, sourced_from_archive, archived_source_url)
         VALUES (?, 1, ?, ?, 'pending', ?, ?, ?) RETURNING id`
      )
        .bind(
          tool.domain,
          sourceUrl,
          cleanedText.slice(0, 20_000),
          Number(sharedDomain),
          Number(fetched.sourcedFromArchive),
          fetched.archivedUrl
        )
        .first<{ id: number }>();
      if (!inserted) throw new Error("insert_failed");

      await runExtraction(
        env,
        inserted.id,
        tool.domain,
        null, // recheck of an existing tool: approvePendingCheck's UPDATE path never touches tools.name
        sourceUrl,
        true,
        sharedDomain,
        fetched.sourcedFromArchive,
        cleanedText,
        fetched.redirectedOffDomainTo
      );
      ok++;
    } catch (err) {
      failed++;
      const reason = err instanceof SsrfBlockedError ? `blocked: ${err.message}` : String(err instanceof Error ? err.message : err);
      console.warn(`[cron] monthly recheck failed for ${tool.domain}: ${reason}`);
    }
  }

  console.warn(`[cron] monthly recheck: ${ok} re-verified, ${failed} failed, ${results.length} total published tools`);
}
