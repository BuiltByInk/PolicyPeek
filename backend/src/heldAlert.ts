import type { Env } from "./index";
import { sendAlert } from "./alert";
import { cleanText } from "./textUtil";

// The existing human-review listing. Included in alerts as a pointer only;
// opening it still needs the admin token. No new secret or binding.
export const ADMIN_QUEUE_URL = "https://api.getpolicypeek.com/v1/admin/pending";
export const HELD_DIGEST_LIMIT = 20;
export const TEST_ALERT_TEXT =
  "PolicyPeek: test alert. The held-check notifier is live. No checks were changed.";

export interface HeldCheckRow {
  id: number;
  domain: string;
  source_url?: string | null;
}

export function formatHeldCheckAlert(row: HeldCheckRow): string {
  const domain = cleanText(row.domain, 200) ?? "(unknown domain)";
  const source = cleanText(row.source_url, 500) ?? "(no source URL)";
  return [
    "PolicyPeek: new check held for review.",
    `#${row.id} ${domain}`,
    `Source: ${source}`,
    `Queue: GET ${ADMIN_QUEUE_URL}`,
  ].join("\n");
}

export function formatHeldDigest(rows: Array<{ id: number; domain: string }>): string {
  const shown = rows.slice(0, HELD_DIGEST_LIMIT).map((r) => {
    const domain = cleanText(r.domain, 200) ?? "(unknown domain)";
    return `#${r.id} ${domain}`;
  });
  const more = rows.length > HELD_DIGEST_LIMIT ? `\n...and ${rows.length - HELD_DIGEST_LIMIT} more` : "";
  return `PolicyPeek: ${rows.length} check(s) still waiting for review.\n${shown.join("\n")}${more}\nQueue: GET ${ADMIN_QUEUE_URL}`;
}

// Never throws: an alert failure must not fail extraction or the /v1/check
// request (extraction already runs in ctx.waitUntil). Only alerts when the
// row is still 'extracted' (held for a person), not when it was
// auto-published ('approved') or never finished extraction ('pending').
// runExtraction is invoked once per pending id, so this fires once per check.
export async function maybeAlertHeldCheck(env: Env, row: HeldCheckRow): Promise<void> {
  try {
    const current = await env.DB.prepare("SELECT status FROM pending_checks WHERE id = ?")
      .bind(row.id)
      .first<{ status: string }>();
    if (current?.status !== "extracted") return;
    await sendAlert(env, formatHeldCheckAlert(row));
  } catch {
    console.warn("[alert] held-check notify failed (status read or send)");
  }
}

// Daily reminder of the review queue. Sends nothing when it is empty.
// Read-only: never updates pending_checks or tools.
export async function alertHeldReviewQueue(env: Env): Promise<void> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, domain FROM pending_checks
       WHERE status = 'extracted'
       ORDER BY created_at ASC, id ASC`
    ).all<{ id: number; domain: string }>();
    if (results.length === 0) return;
    await sendAlert(env, formatHeldDigest(results));
  } catch {
    console.warn("[alert] held-review digest failed (query or send)");
  }
}

// POST /v1/admin/alerts/test — sends one fixed test message. Does not
// read or write D1, and does not take a caller-supplied message body.
export async function handleAlertTest(env: Env): Promise<Response> {
  const sent = await sendAlert(env, TEST_ALERT_TEXT);
  return Response.json({ ok: true, sent });
}
