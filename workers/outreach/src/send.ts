// Gate 3 (+ gate 5 suppression check, card gate, hand-sent skip): plan and send.
// Sending is cron-only; there is no HTTP route that sends.
import { vetContact, type ContactRow } from "./contacts";
import { assertNoBanned, renderFollowup, renderInitial, type RenderedEmail } from "./template";

export const HARD_DAILY_MAX = 5; // LIA (Elliot, 10 Nov): never more than 5/day, whatever D1 says
export const DOMAIN_GAP_DAYS = 14; // <= 1 email per recipient domain per 14 days
export const LIFETIME_MAX_PER_CONTACT = 2; // initial + one follow-up
export const FOLLOWUP_AFTER_DAYS = 14;
export const FROM = { email: "privacy@mail.getpolicypeek.com", name: "PolicyPeek" };
export const REPLY_TO = "privacy@getpolicypeek.com";

export type Mode = "dry_run" | "test" | "live";

export interface SendEnv {
  DB: D1Database;
  // Real-recipient binding (used only in live mode).
  EMAIL?: SendEmail;
  // Test binding pinned in wrangler config to destination_address elliotink@pm.me.
  EMAIL_TEST?: SendEmail;
  OUTREACH_ENABLED?: string; // must be exactly "true"
  OUTREACH_MODE?: string; // "dry_run" (default) | "test" | "live"
}

export function modeOf(env: SendEnv): Mode {
  return env.OUTREACH_MODE === "live" ? "live" : env.OUTREACH_MODE === "test" ? "test" : "dry_run";
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();

async function setting(db: D1Database, key: string): Promise<string | null> {
  return (await db.prepare("SELECT value FROM outreach_settings WHERE key = ?").bind(key).first<string>("value")) ?? null;
}

// Kill switch: both the env var AND the D1 paused flag. Missing => stopped.
export async function sendingAllowed(env: SendEnv): Promise<{ ok: boolean; reason?: string }> {
  if (env.OUTREACH_ENABLED !== "true") return { ok: false, reason: "OUTREACH_ENABLED_not_true" };
  if ((await setting(env.DB, "paused")) !== "0") return { ok: false, reason: "d1_paused" };
  return { ok: true };
}

export async function effectiveDailyCap(db: D1Database): Promise<number> {
  const n = Number.parseInt((await setting(db, "daily_cap")) ?? "0", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, HARD_DAILY_MAX) : 0;
}

export async function sentTodayCount(db: D1Database, now: Date): Promise<number> {
  const start = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  return (await db.prepare("SELECT COUNT(*) AS n FROM outreach_sends WHERE claimed_at >= ? AND status IN ('claimed','sent')").bind(start).first<number>("n")) ?? 0;
}

// Card gate (Elliot 11:32, rule replaced 11:39 UK). No row => blocked (fail closed).
export async function cardGate(db: D1Database, toolSlug: string): Promise<{ open: boolean; reason: string }> {
  const g = await db.prepare("SELECT passes, gate_reason, card_confirmed, confirmed_by FROM card_gate WHERE tool_slug = ?").bind(toolSlug).first<{ passes: number; gate_reason: string; card_confirmed: number; confirmed_by: string | null }>();
  if (!g) return { open: false, reason: "blocked: no card_gate row (fail closed)" };
  if (g.card_confirmed === 1) return { open: true, reason: `pass: card confirmed by ${g.confirmed_by}` };
  return { open: g.passes === 1, reason: g.gate_reason };
}

// Gate 5: address AND domain.
export async function isSuppressed(db: D1Database, email: string, domain: string): Promise<boolean> {
  const r = await db.prepare("SELECT 1 AS x FROM suppressions WHERE (kind = 'address' AND value = ?) OR (kind = 'domain' AND value = ?) LIMIT 1").bind(email.toLowerCase(), domain.toLowerCase()).first();
  return !!r;
}

export interface Candidate {
  contact: ContactRow;
  kind: "initial" | "followup";
  recipientDomain: string;
  initialSentAt?: string;
  gateReason: string;
}

export interface Skip { tool_slug: string; reason: string }

// Every per-contact rule. Run when queueing AND again immediately before the send.
export async function checkContact(db: D1Database, c: ContactRow, kind: "initial" | "followup", now: Date): Promise<{ ok: true; recipientDomain: string; initialSentAt?: string; gateReason: string } | { ok: false; reason: string }> {
  if (c.status === "sent_by_hand" || c.hand_sent_at) return { ok: false, reason: "sent_by_hand" };
  if (c.status !== "eligible") return { ok: false, reason: `status_${c.status}` };
  if (c.kind === "held" && (await setting(db, "held_hand_list_received")) !== "1") return { ok: false, reason: "held_awaiting_hand_sent_list" };
  const v = vetContact({ contactEmail: c.contact_email, toolDomain: c.tool_domain, contactSourceUrl: c.contact_source_url });
  if (!v.ok) return { ok: false, reason: `vet_${v.reason}` };
  // A parent-company address needs BOTH the code exception and the recorded reason on the row.
  if (v.domainMatchException && !c.domain_match_exception) return { ok: false, reason: "vet_domain_match_exception_not_recorded" };
  const gate = await cardGate(db, c.tool_slug);
  if (!gate.open) return { ok: false, reason: `card_gate ${gate.reason}` };
  if (await isSuppressed(db, c.contact_email, v.recipientDomain)) return { ok: false, reason: "suppressed" };
  const sends = (await db.prepare("SELECT kind, status, claimed_at FROM outreach_sends WHERE tool_slug = ? AND contact_email = ?").bind(c.tool_slug, c.contact_email).all<{ kind: string; status: string; claimed_at: string }>()).results;
  if (sends.length >= LIFETIME_MAX_PER_CONTACT) return { ok: false, reason: "lifetime_max" };
  const initial = sends.find((s) => s.kind === "initial");
  if (kind === "initial" && initial) return { ok: false, reason: "initial_already_claimed" };
  if (kind === "followup") {
    if (!initial || initial.status === "failed") return { ok: false, reason: "no_successful_initial" };
    if (sends.some((s) => s.kind === "followup")) return { ok: false, reason: "followup_already_claimed" };
    if (now.getTime() - Date.parse(initial.claimed_at) < FOLLOWUP_AFTER_DAYS * DAY) return { ok: false, reason: "followup_not_due" };
    // Any matched reply (not an auto-reply) cancels the follow-up.
    const reply = await db.prepare("SELECT 1 AS x FROM outreach_replies WHERE matched_contact_id = ? AND classification IN ('reply','objection','bounce') LIMIT 1").bind(c.id).first();
    if (reply) return { ok: false, reason: "reply_received" };
  }
  // <= 1 email per recipient domain per 14 days (any contact, any kind).
  const since = iso(new Date(now.getTime() - DOMAIN_GAP_DAYS * DAY));
  const recent = await db.prepare("SELECT 1 AS x FROM outreach_sends WHERE recipient_domain = ? AND claimed_at >= ? AND status IN ('claimed','sent') LIMIT 1").bind(v.recipientDomain, since).first();
  if (recent && kind === "initial") return { ok: false, reason: "domain_gap_14d" };
  if (recent && kind === "followup") return { ok: false, reason: "domain_gap_14d" };
  return { ok: true, recipientDomain: v.recipientDomain, initialSentAt: initial?.claimed_at, gateReason: gate.reason };
}

// Queue for today: follow-ups first (oldest initial first), then initials, up to the cap.
export async function planDay(db: D1Database, now: Date): Promise<{ cap: number; alreadyToday: number; queue: Candidate[]; skipped: Skip[] }> {
  const cap = await effectiveDailyCap(db);
  const alreadyToday = await sentTodayCount(db, now);
  const contacts = (await db.prepare("SELECT * FROM outreach_contacts ORDER BY id").all<ContactRow>()).results;
  const queue: Candidate[] = [];
  const skipped: Skip[] = [];
  const domainsToday = new Set<string>();
  for (const kind of ["followup", "initial"] as const) {
    for (const c of contacts) {
      if (queue.some((q) => q.contact.id === c.id)) continue;
      const r = await checkContact(db, c, kind, now);
      if (!r.ok) {
        if (kind === "initial" && !skipped.some((s) => s.tool_slug === c.tool_slug)) skipped.push({ tool_slug: c.tool_slug, reason: r.reason });
        continue;
      }
      // A row whose wording fails the locked-template checks is skipped, never sent.
      try {
        render({ contact: c, kind, recipientDomain: r.recipientDomain, initialSentAt: r.initialSentAt, gateReason: r.gateReason });
      } catch (err) {
        skipped.push({ tool_slug: c.tool_slug, reason: `template_${(err as Error).message}` });
        continue;
      }
      if (domainsToday.has(r.recipientDomain)) { skipped.push({ tool_slug: c.tool_slug, reason: "domain_gap_14d" }); continue; }
      if (alreadyToday + queue.length >= cap) { skipped.push({ tool_slug: c.tool_slug, reason: "daily_cap" }); continue; }
      domainsToday.add(r.recipientDomain);
      queue.push({ contact: c, kind, recipientDomain: r.recipientDomain, initialSentAt: r.initialSentAt, gateReason: r.gateReason });
    }
  }
  return { cap, alreadyToday, queue, skipped };
}

export function render(c: Candidate): RenderedEmail {
  const input = { toolName: c.contact.tool_name, policyUrl: c.contact.policy_url, storedPolicyUrl: c.contact.policy_url, contextParagraph: c.contact.question_text, initialSentAt: c.initialSentAt };
  const e = c.kind === "initial" ? renderInitial(input) : renderFollowup(input);
  assertNoBanned(e);
  return e;
}

export interface RunResult { mode: Mode; allowed: boolean; reason?: string; planned: number; sent: { tool_slug: string; kind: string; message_id: string | null; recipient_domain: string }[]; skipped: Skip[]; rendered: { tool_slug: string; to: string; subject: string; text: string; kind: string; card_gate: string }[] }

// Logs: message id, tool slug, recipient domain only.
function log(o: { tool_slug: string; recipient_domain: string; message_id?: string | null; event: string }): void {
  console.log(JSON.stringify(o));
}

export async function runDaily(env: SendEnv, now = new Date()): Promise<RunResult> {
  const mode = modeOf(env);
  const plan = await planDay(env.DB, now);
  const out: RunResult = { mode, allowed: false, planned: plan.queue.length, sent: [], skipped: plan.skipped, rendered: [] };
  for (const c of plan.queue) {
    const e = render(c);
    out.rendered.push({ tool_slug: c.contact.tool_slug, card_gate: c.gateReason, to: mode === "live" ? c.contact.contact_email : "elliotink@pm.me (test binding)", subject: mode === "test" ? `[TEST] ${e.subject}` : e.subject, text: e.text, kind: c.kind });
  }
  if (mode === "dry_run") { out.reason = "dry_run"; return out; }
  const gate = await sendingAllowed(env);
  out.allowed = gate.ok;
  if (!gate.ok) { out.reason = gate.reason; return out; }

  for (const c of plan.queue) {
    // Re-check everything immediately before the send.
    const again = await checkContact(env.DB, c.contact, c.kind, now);
    if (!again.ok) { out.skipped.push({ tool_slug: c.contact.tool_slug, reason: `precheck_${again.reason}` }); continue; }
    if (!(await sendingAllowed(env)).ok) { out.reason = "kill_switch_flipped_mid_run"; break; }
    if ((await sentTodayCount(env.DB, now)) >= (await effectiveDailyCap(env.DB))) { out.skipped.push({ tool_slug: c.contact.tool_slug, reason: "daily_cap" }); break; }
    const e = render(c);
    if (mode === "test") {
      // Test copies go only to the pinned test binding and never count as real sends.
      if (!env.EMAIL_TEST) { out.reason = "no_test_binding"; break; }
      const r = await env.EMAIL_TEST.send({ from: FROM, to: "elliotink@pm.me", replyTo: REPLY_TO, subject: `[TEST] ${e.subject}`, text: e.text });
      await env.DB.prepare("INSERT INTO outreach_test_sends (contact_id, kind, message_id, sent_at) VALUES (?, ?, ?, ?)").bind(c.contact.id, c.kind, r.messageId ?? null, iso(now)).run();
      out.sent.push({ tool_slug: c.contact.tool_slug, kind: c.kind, message_id: r.messageId ?? null, recipient_domain: "pm.me" });
      log({ event: "test_sent", tool_slug: c.contact.tool_slug, recipient_domain: "pm.me", message_id: r.messageId });
      continue;
    }
    if (!env.EMAIL) { out.reason = "no_send_binding"; break; }
    // Idempotency: claim first; send only if the UNIQUE insert succeeded.
    const claim = await env.DB.prepare("INSERT OR IGNORE INTO outreach_sends (contact_id, tool_slug, contact_email, recipient_domain, kind, status, claimed_at) VALUES (?, ?, ?, ?, ?, 'claimed', ?)").bind(c.contact.id, c.contact.tool_slug, c.contact.contact_email.toLowerCase(), c.recipientDomain, c.kind, iso(now)).run();
    if (claim.meta.changes !== 1) { out.skipped.push({ tool_slug: c.contact.tool_slug, reason: "claim_conflict" }); continue; }
    try {
      const r = await env.EMAIL.send({ from: FROM, to: c.contact.contact_email, replyTo: REPLY_TO, subject: e.subject, text: e.text });
      await env.DB.prepare("UPDATE outreach_sends SET status = 'sent', message_id = ?, sent_at = ? WHERE tool_slug = ? AND contact_email = ? AND kind = ?").bind(r.messageId ?? null, iso(new Date()), c.contact.tool_slug, c.contact.contact_email.toLowerCase(), c.kind).run();
      out.sent.push({ tool_slug: c.contact.tool_slug, kind: c.kind, message_id: r.messageId ?? null, recipient_domain: c.recipientDomain });
      log({ event: "sent", tool_slug: c.contact.tool_slug, recipient_domain: c.recipientDomain, message_id: r.messageId });
    } catch (err) {
      // The claim row stays: a failed or unknown send is never retried automatically.
      const code = (err as { code?: string }).code ?? "send_error";
      await env.DB.prepare("UPDATE outreach_sends SET status = 'failed', error_code = ? WHERE tool_slug = ? AND contact_email = ? AND kind = ?").bind(String(code).slice(0, 60), c.contact.tool_slug, c.contact.contact_email.toLowerCase(), c.kind).run();
      log({ event: "send_failed", tool_slug: c.contact.tool_slug, recipient_domain: c.recipientDomain });
    }
  }
  return out;
}
