// Gate 4 + gate 5 (inbound side): the privacy@ Email Routing Worker.
// Elliot 11:28 UK / Security 11:29 UK: only Elliot reads replies; no AI.
// - Forwards to ONE hard-coded address (Elliot's Proton mailbox). Never replies.
// - Stores metadata only: tool slug, date, message ID, SPF/DKIM/DMARC results,
//   matched contact/domain. No body, subject, attachments or sender local part.
// - Reply text is parsed in memory only to spot objections; it is never stored,
//   queued, posted to any API/webhook, or passed to Research, agents or AI.
// - Drops DMARC aggregate reports, auto-replies and bounces before forwarding.
// - Has no send binding and touches only outreach_replies and suppressions:
//   a reply can never trigger a send, a publish or a verdict change.
import PostalMime from "postal-mime";

export const FORWARD_TO = "elliotink@pm.me";
export const MAX_PARSE_BYTES = 256 * 1024;
const OWN_DOMAINS = ["getpolicypeek.com", "mail.getpolicypeek.com"];

export interface ReplyEnv { DB: D1Database }

export type Classification = "dmarc_report" | "loop" | "bounce" | "auto_reply" | "objection" | "reply";

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

export function domainOf(addr: string): string {
  const m = addr.toLowerCase().match(/@([a-z0-9.-]+)>?\s*$/);
  return m ? m[1] : "";
}
function registrableish(host: string): string {
  const p = host.split(".").filter(Boolean);
  if (p.length <= 2) return host;
  const two = p.slice(-2).join(".");
  return /^(co|com|org|net|ac|gov)\.[a-z]{2}$/.test(two) ? p.slice(-3).join(".") : two;
}

// Objection wording (unsure => objection, per Security gate 5).
const OBJECTION = [/\bstop\b/i, /\bunsubscribe\b/i, /\bremove (me|us)\b/i, /\bdo not (contact|email|e-mail|write)\b/i, /\bdon'?t (contact|email|e-mail|write)\b/i, /\bno (further|more) (contact|emails?)\b/i, /\bopt(?:-| )?out\b/i, /\bnot interested\b/i, /\bcease\b/i, /\btake (me|us) off\b/i, /\bobject\b/i, /\bharass/i, /\bspam\b/i];

export function classify(h: Headers, from: string, textHead: string): Classification {
  const subject = lower(h.get("subject"));
  const ctype = lower(h.get("content-type"));
  const fromL = from.toLowerCase();
  if (OWN_DOMAINS.some((d) => fromL.endsWith(`@${d}`))) return "loop";
  if (/^report domain:/.test(subject) || /\bdmarc\b.*\breport\b/.test(subject) || /(^|[.@])dmarc|noreply-dmarc|dmarcreport/.test(fromL) || ctype.includes("report-type=aggregate")) return "dmarc_report";
  if (ctype.includes("report-type=delivery-status") || ctype.includes("report-type=feedback-report") || /^(mailer-daemon|postmaster)@/.test(fromL) || /^(undeliverable|delivery status notification|mail delivery failed|returned mail)/.test(subject)) return "bounce";
  const autoSub = lower(h.get("auto-submitted"));
  const prec = lower(h.get("precedence"));
  if ((autoSub && autoSub !== "no") || ["bulk", "junk", "list", "auto_reply"].includes(prec) || h.has("x-autoreply") || h.has("x-autorespond") || lower(h.get("x-auto-response-suppress")).includes("all") || /^(out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|auto:)/.test(subject)) return "auto_reply";
  if (OBJECTION.some((r) => r.test(textHead) || r.test(subject))) return "objection";
  return "reply";
}

export function authResults(h: Headers): { spf: string | null; dkim: string | null; dmarc: string | null } {
  const ar = lower(h.get("authentication-results")) + " " + lower(h.get("arc-authentication-results"));
  const pick = (k: string) => ar.match(new RegExp(`\\b${k}=([a-z]+)`))?.[1] ?? null;
  return { spf: pick("spf"), dkim: pick("dkim"), dmarc: pick("dmarc") };
}

function messageIds(v: string | null): string[] {
  return (v ?? "").match(/<[^<>\s]+>/g) ?? [];
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, max));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, out.length - off);
    out.set(c.subarray(0, take), off);
    off += take;
    if (off >= out.length) break;
  }
  return out;
}

export interface Match { contactId: number | null; toolSlug: string | null; method: "in_reply_to" | "references" | "sender_domain" | null }

export async function matchReply(db: D1Database, h: Headers, fromDomain: string): Promise<Match> {
  for (const [hdr, method] of [["in-reply-to", "in_reply_to"], ["references", "references"]] as const) {
    for (const id of messageIds(h.get(hdr))) {
      const r = await db.prepare("SELECT contact_id, tool_slug FROM outreach_sends WHERE message_id = ? LIMIT 1").bind(id).first<{ contact_id: number; tool_slug: string }>();
      if (r) return { contactId: r.contact_id, toolSlug: r.tool_slug, method };
    }
  }
  const reg = registrableish(fromDomain);
  const r = await db.prepare("SELECT contact_id, tool_slug FROM outreach_sends WHERE recipient_domain = ? ORDER BY claimed_at DESC LIMIT 1").bind(reg).first<{ contact_id: number; tool_slug: string }>();
  return r ? { contactId: r.contact_id, toolSlug: r.tool_slug, method: "sender_domain" } : { contactId: null, toolSlug: null, method: null };
}

export async function handleEmail(message: ForwardableEmailMessage, env: ReplyEnv, now = new Date()): Promise<{ classification: Classification; forwarded: boolean; match: Match }> {
  const from = message.from ?? "";
  const fromDomain = domainOf(from);
  // Parse a capped copy in memory only (objection check); never stored.
  let textHead = "";
  try {
    const raw = await readCapped(message.raw, MAX_PARSE_BYTES);
    const parsed = await PostalMime.parse(raw);
    textHead = (parsed.text ?? "").slice(0, 4000);
  } catch {
    textHead = "";
  }
  const classification = classify(message.headers, from, textHead);
  textHead = "";
  const none: Match = { contactId: null, toolSlug: null, method: null };
  if (classification === "dmarc_report" || classification === "loop") return { classification, forwarded: false, match: none };

  const match = await matchReply(env.DB, message.headers, fromDomain);
  const auth = authResults(message.headers);
  let forwarded = false;
  if (classification === "reply" || classification === "objection") {
    await message.forward(FORWARD_TO, new Headers({ "X-PolicyPeek-Match": match.toolSlug ? `${match.toolSlug} (${match.method})` : "unmatched" }));
    forwarded = true;
  }
  const stmts = [
    env.DB.prepare("INSERT INTO outreach_replies (tool_slug, matched_contact_id, match_method, from_domain, message_id, received_at, classification, auth_spf, auth_dkim, auth_dmarc, raw_size, forwarded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(match.toolSlug, match.contactId, match.method, fromDomain, message.headers.get("message-id")?.slice(0, 300) ?? null, now.toISOString(), classification, auth.spf, auth.dkim, auth.dmarc, message.rawSize, forwarded ? 1 : 0),
  ];
  // Gate 5: an objection suppresses the address AND its domain; a bounce
  // suppresses the matched contact's address. Minimal rows, kept indefinitely.
  if (classification === "objection") {
    const addr = from.toLowerCase().match(/[^<\s]+@[^>\s]+/)?.[0] ?? "";
    if (addr) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('address', ?, 'objection')").bind(addr));
    if (fromDomain) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('domain', ?, 'objection')").bind(registrableish(fromDomain)));
  }
  if (classification === "bounce" && match.contactId !== null) {
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) SELECT 'address', lower(contact_email), 'bounce' FROM outreach_contacts WHERE id = ?").bind(match.contactId));
  }
  await env.DB.batch(stmts);
  console.log(JSON.stringify({ event: "inbound", classification, tool_slug: match.toolSlug, sender_domain: fromDomain, forwarded }));
  return { classification, forwarded, match };
}
