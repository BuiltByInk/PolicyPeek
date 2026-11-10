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
import { getDomain } from "tldts";

export const FORWARD_TO = "elliotink@pm.me";
export const MAX_PARSE_BYTES = 256 * 1024;
const OWN_DOMAINS = ["getpolicypeek.com", "mail.getpolicypeek.com"];
// MF5 (Jump 12:07 UK): we send From privacy@mail.getpolicypeek.com with
// Reply-To privacy@getpolicypeek.com. Replies may come to either, so both
// literal Email Routing rules (apex, and mail.* once MX is added there) point at
// this Worker. Anything else routed here by mistake is rejected, not forwarded.
export const ACCEPTED_RECIPIENTS = ["privacy@getpolicypeek.com", "privacy@mail.getpolicypeek.com"] as const;
export function acceptedRecipient(to: string): boolean {
  return (ACCEPTED_RECIPIENTS as readonly string[]).includes(to.trim().toLowerCase().replace(/^<|>$/g, ""));
}

export interface ReplyEnv { DB: D1Database }

export type Classification = "wrong_recipient" | "dmarc_report" | "loop" | "bounce" | "auto_reply" | "objection" | "reply";

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

export function domainOf(addr: string): string {
  const m = addr.toLowerCase().match(/@([a-z0-9.-]+)>?\s*$/);
  return m ? m[1] : "";
}
// MF4 (Security re-review 10 Nov): same Public Suffix List parse as the sender
// (outreach/src/contacts.ts registrable), so a domain suppression written here
// always matches the recipient_domain the sender checks. Unparseable => the
// lower-cased host itself (never an empty string, never a public suffix).
export function registrable(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, "");
  return getDomain(h, { allowPrivateDomains: true }) ?? h;
}

// Objection wording (unsure => objection, per Security gate 5).
const OBJECTION = [/\bstop\b/i, /\bunsubscribe\b/i, /\bremove (me|us)\b/i, /\bdo not (contact|email|e-mail|write)\b/i, /\bdon'?t (contact|email|e-mail|write)\b/i, /\bno (further|more) (contact|emails?)\b/i, /\bopt(?:-| )?out\b/i, /\bnot interested\b/i, /\bcease\b/i, /\btake (me|us) off\b/i, /\bobject\b/i, /\bharass/i, /\bspam\b/i];

// MF6: objection matching runs only on the sender's OWN new text. Our email
// says 'reply "stop"', so matching the quoted original would class almost
// every reply as an objection. Cut at the first reply/forward marker and drop
// ">"-quoted lines. If nothing is left (top-quoting only), the full text is
// used again, so an unsure case still falls back to "objection" (fails safe).
const QUOTE_MARKERS = [
  /^\s*On\b[\s\S]{0,300}?\bwrote:\s*$/im, // Gmail/Apple ("On Tue, ... <x> wrote:"), may wrap over 2 lines
  /^\s*Le\b[\s\S]{0,300}?\ba écrit\s*:\s*$/im,
  /^\s*Am\b[\s\S]{0,300}?\bschrieb\b.*:\s*$/im,
  /^\s*-{2,}\s*(Original Message|Forwarded message|Ursprüngliche Nachricht|Message d'origine)\s*-{2,}/im,
  /^\s*_{8,}\s*$/m, // Outlook separator
  /^\s*From:\s.+\n\s*(Sent|Date):\s/im, // Outlook header block
  /^\s*De\s*:\s.+\n\s*(Envoyé|Date)\s*:\s/im,
];
export function stripQuoted(text: string): string {
  let cut = text.length;
  for (const r of QUOTE_MARKERS) {
    const m = r.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  const lines = text.slice(0, cut).split(/\r?\n/);
  const kept = lines.filter((l) => !/^\s*>/.test(l));
  const own = kept.join("\n");
  const removedSomething = cut < text.length || kept.length < lines.length;
  // Our own stop line, if pasted back unquoted, is never the sender's objection.
  const cleaned = own.replace(/If you'd rather not hear from us, reply "stop" and we won't email again\./gi, " ").trim();
  return cleaned || (removedSomething ? text : "");
}

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
  const own = stripQuoted(textHead);
  if (OBJECTION.some((r) => r.test(own) || r.test(subject))) return "objection";
  return "reply";
}

// SF2 (Security re-review 10 Nov): a sender can add its own
// Authentication-Results header. Only the header stamped by Cloudflare Email
// Routing (authserv-id mx.cloudflare.net) is read; ARC headers are ignored.
// The values are stored for Elliot's information only and are NEVER used for
// any decision (classification, matching or suppression).
export const TRUSTED_AUTHSERV_ID = "mx.cloudflare.net";
export function authResults(h: Headers): { spf: string | null; dkim: string | null; dmarc: string | null } {
  // Headers.get() joins repeated headers with ", "; split at each "<authserv-id>;".
  const all = lower(h.get("authentication-results"));
  const parts = all.split(/,\s*(?=[a-z0-9.-]+\.[a-z]{2,}\s*;)/);
  const ours = parts.filter((p) => p.trim().startsWith(`${TRUSTED_AUTHSERV_ID};`));
  // Exactly one trusted header expected; zero or several (spoof attempt) => unknown.
  if (ours.length !== 1) return { spf: null, dkim: null, dmarc: null };
  const pick = (k: string) => ours[0].match(new RegExp(`\\b${k}=([a-z]+)`))?.[1] ?? null;
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
  const reg = registrable(fromDomain);
  const r = await db.prepare("SELECT contact_id, tool_slug FROM outreach_sends WHERE recipient_domain = ? ORDER BY claimed_at DESC LIMIT 1").bind(reg).first<{ contact_id: number; tool_slug: string }>();
  return r ? { contactId: r.contact_id, toolSlug: r.tool_slug, method: "sender_domain" } : { contactId: null, toolSlug: null, method: null };
}

export interface HandleResult { classification: Classification; forwarded: boolean; match: Match; dbError?: boolean }

// Header From address (RFC 5322 From:), lower-cased; "" if none or unparseable.
export function headerFromAddress(h: Headers): string {
  const v = h.get("from") ?? "";
  const angle = v.match(/<\s*([^<>\s@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*>/);
  const bare = v.match(/([^<>\s@",;:]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  return (angle?.[1] ?? bare?.[1] ?? "").toLowerCase();
}

// MF3 (Security re-review 10 Nov): what an objection suppresses. Ticketing
// systems send with bounce-style envelopes (bounces+x@em.zendesk.com), so the
// envelope alone would suppress the wrong address/domain. We suppress:
//  - the matched contact's own address and its recipient_domain (from D1),
//  - the header From address and its registrable domain,
//  - the envelope address as an extra (address only; its domain only when
//    there is no usable header From).
export function objectionSuppressions(envelopeFrom: string, headerFrom: string): { addresses: string[]; domains: string[] } {
  const env = envelopeFrom.toLowerCase().match(/[^<\s]+@[^>\s]+/)?.[0] ?? "";
  const addresses = [...new Set([headerFrom, env].filter(Boolean))];
  const domains: string[] = [];
  if (headerFrom) domains.push(registrable(domainOf(headerFrom)));
  else if (env) domains.push(registrable(domainOf(env)));
  return { addresses, domains: [...new Set(domains.filter((d) => d && !OWN_DOMAINS.includes(d)))] };
}

export async function handleEmail(message: ForwardableEmailMessage, env: ReplyEnv, now = new Date()): Promise<HandleResult> {
  if (!acceptedRecipient(message.to ?? "")) {
    message.setReject("Unknown recipient");
    return { classification: "wrong_recipient", forwarded: false, match: { contactId: null, toolSlug: null, method: null } };
  }
  const from = message.from ?? "";
  const hdrFrom = headerFromAddress(message.headers);
  // Sender's company domain: header From when present (the real sender), else envelope.
  const fromDomain = domainOf(hdrFrom || from);
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

  // SF1 (Security re-review 10 Nov): forward BEFORE any D1 work, so a D1 error
  // (tables missing, outage) can never stop a reply reaching Elliot. The
  // forwarded header therefore carries only the in-memory classification;
  // the tool match is recorded in D1 afterwards.
  let forwarded = false;
  if (classification === "reply" || classification === "objection") {
    await message.forward(FORWARD_TO, new Headers({ "X-PolicyPeek-Class": classification }));
    forwarded = true;
  }
  let match = none;
  try {
    match = await matchReply(env.DB, message.headers, fromDomain);
    const auth = authResults(message.headers);
    const stmts = [
      env.DB.prepare("INSERT INTO outreach_replies (tool_slug, matched_contact_id, match_method, from_domain, message_id, received_at, classification, auth_spf, auth_dkim, auth_dmarc, raw_size, forwarded) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(match.toolSlug, match.contactId, match.method, fromDomain, message.headers.get("message-id")?.slice(0, 300) ?? null, now.toISOString(), classification, auth.spf, auth.dkim, auth.dmarc, message.rawSize, forwarded ? 1 : 0),
    ];
    // Gate 5: an objection suppresses the address AND its domain; a bounce
    // suppresses the matched contact's address. Minimal rows, kept indefinitely.
    if (classification === "objection") {
      const sup = objectionSuppressions(from, hdrFrom);
      for (const a of sup.addresses) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('address', ?, 'objection')").bind(a));
      for (const d of sup.domains) stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('domain', ?, 'objection')").bind(d));
      if (match.contactId !== null) {
        stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) SELECT 'address', lower(contact_email), 'objection' FROM outreach_contacts WHERE id = ?").bind(match.contactId));
        stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) SELECT DISTINCT 'domain', lower(recipient_domain), 'objection' FROM outreach_sends WHERE contact_id = ?").bind(match.contactId));
      }
    }
    if (classification === "bounce" && match.contactId !== null) {
      stmts.push(env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) SELECT 'address', lower(contact_email), 'bounce' FROM outreach_contacts WHERE id = ?").bind(match.contactId));
    }
    await env.DB.batch(stmts);
  } catch {
    // Never rethrow: the reply has already been forwarded. Counts-only log; Elliot
    // still has the message in Proton and can suppress by hand.
    console.log(JSON.stringify({ event: "inbound_db_error", classification, sender_domain: fromDomain, forwarded }));
    return { classification, forwarded, match, dbError: true };
  }
  console.log(JSON.stringify({ event: "inbound", classification, tool_slug: match.toolSlug, sender_domain: fromDomain, forwarded }));
  return { classification, forwarded, match };
}
