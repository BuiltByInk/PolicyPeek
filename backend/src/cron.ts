import type { Env } from "./index";

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
