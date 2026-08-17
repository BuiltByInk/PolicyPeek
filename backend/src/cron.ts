import type { Env } from "./index";
import { SsrfBlockedError } from "./ssrf";
import { cleanHtmlToText } from "./htmlClean";
import { isKnownSharedDomain } from "./sharedDomains";
import { runExtraction, fetchPolicyText } from "./check";

const STUCK_THRESHOLD_MINUTES = 30;

interface StuckRow {
  id: number;
  domain: string;
  created_at: string;
}

// Observability only — flags jobs that never made it out of "pending"
// (extraction never ran or never finished) so a human notices, no
// auto-retry or remediation.
export async function checkStuckPending(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, domain, created_at FROM pending_checks
     WHERE status = 'pending'
       AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`
  )
    .bind(`-${STUCK_THRESHOLD_MINUTES} minutes`)
    .all<StuckRow>();

  if (results.length > 0) {
    console.warn(
      `[cron] ${results.length} pending_checks stuck past ${STUCK_THRESHOLD_MINUTES}m:`,
      results.map((r) => `#${r.id} ${r.domain} (since ${r.created_at})`).join("; ")
    );
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
      const fetched = await fetchPolicyText(sourceUrl);
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
        sourceUrl,
        true,
        sharedDomain,
        fetched.sourcedFromArchive,
        cleanedText
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
