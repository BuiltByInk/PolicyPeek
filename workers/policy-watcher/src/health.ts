// Consecutive fetch-failure tracking (Task 2). A successful fetch resets the
// count. After 3 failures in a row, flag the tool on Elliot's queue. This
// never writes a verdict or touches policypeek-db.
import type { Result } from "./watch";

export const FAILURE_FLAG_THRESHOLD = 3;
export const FETCH_FAILED_REASON = "fetch_failed_3x";

export function isFetchFailure(status: Result["status"]): boolean {
  return status === "failed";
}

export function isFetchSuccess(status: Result["status"]): boolean {
  return status === "ok_unchanged" || status === "ok_first" || status === "ok_changed";
}

export async function recordHealth(env: { DB: D1Database }, r: Result, now: Date): Promise<{ consecutive: number; flagged: boolean }> {
  if (isFetchSuccess(r.status)) {
    await env.DB.prepare("UPDATE watch_targets SET consecutive_failures = 0 WHERE tool_slug = ? AND policy_url = ?")
      .bind(r.tool_slug, r.policy_url)
      .run();
    return { consecutive: 0, flagged: false };
  }
  if (!isFetchFailure(r.status)) return { consecutive: 0, flagged: false };

  await env.DB.prepare(
    "UPDATE watch_targets SET consecutive_failures = consecutive_failures + 1 WHERE tool_slug = ? AND policy_url = ?"
  )
    .bind(r.tool_slug, r.policy_url)
    .run();
  const row = await env.DB.prepare("SELECT consecutive_failures FROM watch_targets WHERE tool_slug = ? AND policy_url = ?")
    .bind(r.tool_slug, r.policy_url)
    .first<{ consecutive_failures: number }>();
  const consecutive = row?.consecutive_failures ?? 0;
  if (consecutive < FAILURE_FLAG_THRESHOLD) return { consecutive, flagged: false };

  const open = await env.DB.prepare(
    "SELECT id FROM elliot_queue WHERE tool_slug = ? AND policy_url = ? AND failed_reason = ? AND status = 'open' LIMIT 1"
  )
    .bind(r.tool_slug, r.policy_url, FETCH_FAILED_REASON)
    .first<{ id: number }>();
  if (!open) {
    await env.DB.prepare(
      "INSERT INTO elliot_queue (created_at, tool_slug, policy_url, old_quote, new_quote, suggested_verdict, failed_reason, status) VALUES (?, ?, ?, NULL, NULL, NULL, ?, 'open')"
    )
      .bind(now.toISOString(), r.tool_slug, r.policy_url, FETCH_FAILED_REASON)
      .run();
  }
  return { consecutive, flagged: true };
}
