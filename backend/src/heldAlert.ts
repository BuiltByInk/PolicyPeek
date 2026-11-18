import type { Env } from "./index";
import { sendAlert, MAX_DETAIL_TEXT } from "./alert";
import { cleanText } from "./textUtil";
import { loadHeldItems, renderDigest, renderHeldAlert } from "./heldDetail";

// The existing human-review listing. Included in alerts as a pointer only;
// opening it still needs admin sign-in. No new secret.
export const ADMIN_QUEUE_URL = "https://api.getpolicypeek.com/v1/admin/pending";
export const TEST_ALERT_TEXT =
  "PolicyPeek: test alert. The held-check notifier is live. No checks were changed.";

export interface HeldCheckRow {
  id: number;
  domain: string;
  source_url?: string | null;
}

// Fallback text used only if the detail lookup fails, so a held check still
// produces a notice.
export function formatHeldCheckAlert(row: HeldCheckRow): string {
  const domain = cleanText(row.domain, 200) ?? "(unknown domain)";
  return [
    "PolicyPeek: new check held for review.",
    `#${row.id} ${domain}`,
    "(Details could not be loaded for this alert; see the review queue.)",
  ].join("\n");
}

// Never throws: an alert failure must not fail extraction or the /v1/check
// request. Only alerts when the row is still 'extracted' (held for a person).
// Since 2026-11-18 the email carries per-tool detail (heldDetail.ts).
export async function maybeAlertHeldCheck(env: Env, row: HeldCheckRow): Promise<void> {
  try {
    const current = await env.DB.prepare("SELECT status FROM pending_checks WHERE id = ?")
      .bind(row.id)
      .first<{ status: string }>();
    if (current?.status !== "extracted") return;
    let detail: ReturnType<typeof renderHeldAlert> | null = null;
    try {
      const { items, outreachAvailable } = await loadHeldItems(env, row.domain);
      const item = items.find((i) => i.check_id === row.id);
      // Same rule as the digest (Elliot, 18 Nov): a held check that needs
      // nothing from him (repeat recheck, already confirmed, waiting on a
      // reply, hand-checked badge the recheck agrees with) sends no email.
      if (item?.group === "none") return;
      if (item) detail = renderHeldAlert(item, outreachAvailable);
    } catch {
      console.warn("[alert] held-check detail lookup failed; sending short notice");
    }
    if (detail) await sendAlert(env, detail.text, { html: detail.html, maxText: MAX_DETAIL_TEXT });
    else await sendAlert(env, formatHeldCheckAlert(row));
  } catch {
    console.warn("[alert] held-check notify failed (status read or send)");
  }
}

// Daily digest, grouped by what Elliot has to do. Sends nothing when nothing
// needs him (renderDigest returns null), including an empty queue.
// Read-only: never updates pending_checks, tools or outreach tables.
export async function alertHeldReviewQueue(env: Env): Promise<void> {
  try {
    const { items, outreachAvailable } = await loadHeldItems(env);
    const digest = renderDigest(items, outreachAvailable);
    if (!digest) return;
    await sendAlert(env, digest.text, { html: digest.html, maxText: MAX_DETAIL_TEXT });
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
