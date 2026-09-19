import type { Env } from "./index";
import { SsrfBlockedError } from "./ssrf";
import { cleanHtmlToText } from "./htmlClean";
import { isKnownSharedDomain } from "./sharedDomains";
import { runExtraction, fetchPolicyText } from "./check";
import { sendAlert } from "./alert";
import { cleanText } from "./textUtil";
import { markToolAttempt } from "./toolCheckState";

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
  last_checked_at: string | null;
  last_check_note: string | null;
}

// Keeping published entries fresh (Elliot, 2026-09-19). Each day a small batch
// of the most overdue tools is re-run through the same fetch -> extract ->
// evaluateAutoPublish path as a fresh submission. A tool is due when it was last
// confirmed more than RECHECK_AFTER_DAYS ago and hasn't been attempted in the
// last RETRY_AFTER_DAYS (so a page that keeps failing backs off instead of
// taking the same slot every day). A small batch per run, not "everything on
// the 1st": one run of ~30 tools would exceed a Worker's subrequest budget
// (each recheck makes several outbound calls), and this catches changes within
// weeks instead of once a month. Unchanged verdicts silently re-confirm and
// advance last_checked_at; a changed verdict always lands in the admin queue
// and does NOT advance it (see evaluateAutoPublish's isRecheck branch).
export const RECHECK_AFTER_DAYS = 30;
export const RETRY_AFTER_DAYS = 3;
export const MAX_RECHECKS_PER_RUN = 5;
export const OVERDUE_ALERT_DAYS = 60;

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)";

export async function runDueRechecks(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, domain, source_urls, last_checked_at, last_check_note FROM tools
     WHERE verified = 1
       AND (last_checked_at IS NULL OR last_checked_at < ${NOW})
       AND (last_attempt_at IS NULL OR last_attempt_at < ${NOW})
     ORDER BY COALESCE(last_checked_at, '') ASC
     LIMIT ?`
  )
    .bind(`-${RECHECK_AFTER_DAYS} days`, `-${RETRY_AFTER_DAYS} days`, MAX_RECHECKS_PER_RUN)
    .all<PublishedToolRow>();

  let ok = 0;
  let failed = 0;

  for (const tool of results) {
    const sourceUrl = (JSON.parse(tool.source_urls || "[]") as string[])[0];
    if (!sourceUrl) continue;

    // Mark the attempt BEFORE the slow work, so a crash or timeout mid-way
    // can't leave this tool at the front of the queue forever.
    await markToolAttempt(env, tool.domain);

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
      console.warn(`[cron] recheck failed for ${tool.domain}: ${reason}`);
      await markToolAttempt(env, tool.domain, `recheck failed: ${reason}`).catch(() => {});
    }
  }

  console.warn(`[cron] due rechecks: ${ok} attempted ok, ${failed} failed, ${results.length} due this run`);

  if (isOverdueAlertDay()) await alertOverdueTools(env);
}

// Mondays only, so a tool that stays overdue produces one message a week, not
// one a day.
export function isOverdueAlertDay(now: Date = new Date()): boolean {
  return now.getUTCDay() === 1;
}

interface OverdueRow {
  domain: string;
  last_checked_at: string | null;
  last_check_note: string | null;
}

export function formatOverdueAlert(rows: OverdueRow[]): string {
  const shown = rows.slice(0, MAX_ROWS_IN_ALERT).map((r) => {
    const note = cleanText(r.last_check_note, 100);
    return `${r.domain} (last confirmed ${r.last_checked_at?.slice(0, 10) ?? "never"})${note ? ` -- ${note}` : ""}`;
  });
  const more = rows.length > MAX_ROWS_IN_ALERT ? `\n...and ${rows.length - MAX_ROWS_IN_ALERT} more` : "";
  return `PolicyPeek: ${rows.length} published tool(s) haven't been re-confirmed for over ${OVERDUE_ALERT_DAYS} days.\n${shown.join("\n")}${more}`;
}

export async function alertOverdueTools(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT domain, last_checked_at, last_check_note FROM tools
     WHERE verified = 1 AND (last_checked_at IS NULL OR last_checked_at < ${NOW})
     ORDER BY COALESCE(last_checked_at, '') ASC`
  )
    .bind(`-${OVERDUE_ALERT_DAYS} days`)
    .all<OverdueRow>();
  if (results.length > 0) await sendAlert(env, formatOverdueAlert(results));
}
