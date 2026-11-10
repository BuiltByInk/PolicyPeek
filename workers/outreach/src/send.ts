// Gate 3 (+ gate 5 suppression check, card gate, hand-sent skip): plan and send.
// Sending is cron-only; there is no HTTP route that sends.
import { isSharedDomain, KNOWN_SHARED_DOMAINS, vetContact, type ContactRow } from "./contacts";
import { assertNoBanned, renderFollowup, renderInitial, type RenderedEmail } from "./template";

export const HARD_DAILY_MAX = 5; // LIA (Elliot, 10 Nov): never more than 5/day, whatever D1 says
export const DOMAIN_GAP_DAYS = 14; // <= 1 email per recipient domain per 14 days
export const LIFETIME_MAX_PER_CONTACT = 2; // initial + one follow-up
export const FOLLOWUP_AFTER_DAYS = 14;
export const TEST_SENDS_PER_DAY = 1;
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

// MF7/MF9: the gate reads the mirrored LIVE verdict, never only the static
// steward file. A passes=1 row opens only while the mirror is fresh and:
//  - unclear_live (unflagged live card, or Elliot ruled "unclear"): the live
//    verdict is unclear ('unrated') or held;
//  - held_tracker: the tool is still unpublished (NULL), held or unclear;
//  - steward_held: the live verdict has not changed since the row was reviewed.
// card_confirmed=1 (Elliot's per-card approval, admin route only) opens it.
export const VERDICT_MAX_AGE_HOURS = 36;
export const UNCLEAR_VERDICTS = ["unrated", "held"] as const;
export const CARD_GATE_OPEN_SQL = `(g.card_confirmed = 1 OR (g.passes = 1 AND g.verdict_as_of IS NOT NULL AND g.verdict_as_of >= ?7 AND (
    (g.basis = 'unclear_live' AND g.live_verdict IN ('unrated','held'))
 OR (g.basis = 'held_tracker' AND (g.live_verdict IS NULL OR g.live_verdict IN ('unrated','held')))
 OR (g.basis = 'steward_held' AND g.live_verdict IS g.verdict_at_load))))`;
const freshSince = (now: Date) => iso(new Date(now.getTime() - VERDICT_MAX_AGE_HOURS * 3_600_000));

// Card gate (Elliot 11:32, rule replaced 11:39 UK). No row => blocked (fail closed).
export async function cardGate(db: D1Database, toolSlug: string, now = new Date()): Promise<{ open: boolean; reason: string }> {
  // MF8: a bare shared company domain can never carry a gate (it would cover every product there).
  if (!toolSlug.includes("#") && isSharedDomain(toolSlug)) return { open: false, reason: "blocked: shared company domain needs a per-tool key (MF8)" };
  const g = await db.prepare(`SELECT passes, gate_reason, card_confirmed, confirmed_by, basis, live_verdict, verdict_at_load, verdict_as_of,
      (SELECT COUNT(*) FROM card_gate g WHERE g.tool_slug = ?1 AND ${CARD_GATE_OPEN_SQL}) AS open_now
    FROM card_gate WHERE tool_slug = ?1`).bind(toolSlug, null, null, null, null, null, freshSince(now)).first<{ passes: number; gate_reason: string; card_confirmed: number; confirmed_by: string | null; basis: string; live_verdict: string | null; verdict_at_load: string | null; verdict_as_of: string | null; open_now: number }>();
  if (!g) return { open: false, reason: "blocked: no card_gate row (fail closed)" };
  if (g.card_confirmed === 1) return { open: true, reason: `pass: card confirmed by ${g.confirmed_by}` };
  if (g.passes !== 1) return { open: false, reason: g.gate_reason };
  if (g.open_now === 1) return { open: true, reason: `${g.gate_reason} [live verdict ${g.live_verdict ?? "unpublished"} as of ${g.verdict_as_of}]` };
  if (!g.verdict_as_of || g.verdict_as_of < freshSince(now)) return { open: false, reason: `blocked: live verdict mirror missing or older than ${VERDICT_MAX_AGE_HOURS}h (MF9)` };
  if (g.basis === "steward_held") return { open: false, reason: `blocked: live verdict changed since review (${g.verdict_at_load ?? "unpublished"} -> ${g.live_verdict ?? "unpublished"}) (MF9)` };
  return { open: false, reason: `blocked: live verdict ${g.live_verdict ?? "unpublished"} is not held/unclear (MF7/MF9)` };
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
  // MF10: the hand-sent check covers every tool on the held tracker, not only kind='held'.
  if ((c.kind === "held" || c.on_held_tracker === 1) && (await setting(db, "held_hand_list_received")) !== "1") return { ok: false, reason: "held_awaiting_hand_sent_list" };
  const v = vetContact({ contactEmail: c.contact_email, toolDomain: c.tool_domain, contactSourceUrl: c.contact_source_url });
  if (!v.ok) return { ok: false, reason: `vet_${v.reason}` };
  // A parent-company address needs BOTH the code exception and the recorded reason on the row.
  if (v.domainMatchException && !c.domain_match_exception) return { ok: false, reason: "vet_domain_match_exception_not_recorded" };
  const gate = await cardGate(db, c.tool_slug, now);
  if (!gate.open) return { ok: false, reason: `card_gate ${gate.reason}` };
  if (await isSuppressed(db, c.contact_email, v.recipientDomain)) return { ok: false, reason: "suppressed" };
  const sends = (await db.prepare("SELECT kind, status, claimed_at FROM outreach_sends WHERE tool_slug = ? AND contact_email = ?").bind(c.tool_slug, c.contact_email).all<{ kind: string; status: string; claimed_at: string }>()).results;
  // MF2: <= 2 emails per contact ADDRESS for life, across every tool (a parent-
  // company address such as privacy@quora.com can serve several tools).
  // Every claim counts, including failed/unknown ones (never retried).
  const lifetime = (await db.prepare("SELECT COUNT(*) AS n FROM outreach_sends WHERE contact_email = ?").bind(c.contact_email.toLowerCase()).first<number>("n")) ?? 0;
  if (lifetime >= LIFETIME_MAX_PER_CONTACT || sends.length >= LIFETIME_MAX_PER_CONTACT) return { ok: false, reason: "lifetime_max" };
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

const dayStartIso = (now: Date) => iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));

// MF1 (Security re-review 10 Nov): the claim is ONE conditional INSERT. D1 runs
// each statement on its own, serially, so two overlapping runs (cron retry,
// manual trigger, overlapping deploys) cannot both pass a count and then both
// insert. Every rule that a race could break is re-checked inside it:
//  - kill switch: D1 paused = '0'
//  - daily cap: claims today < min(daily_cap, HARD_DAILY_MAX) (clamped in SQL too)
//  - <= 1 per recipient domain per 14 days
//  - <= 2 per contact address for life, all tools (MF2)
//  - no address or domain suppression
//  - contact still 'eligible', not hand-sent; held rows need the hand-sent list
//  - card gate still open incl. fresh live-verdict mirror (CARD_GATE_OPEN_SQL)
// The email is sent only if this statement inserted exactly one row.
const KNOWN_SHARED_SQL = KNOWN_SHARED_DOMAINS.map((d) => `'${d}'`).join(", ");
export const CLAIM_SQL = `INSERT OR IGNORE INTO outreach_sends (contact_id, tool_slug, contact_email, recipient_domain, kind, status, claimed_at)
SELECT c.id, c.tool_slug, lower(c.contact_email), ?1, ?2, 'claimed', ?3
FROM outreach_contacts c
WHERE c.id = ?4
  AND c.status = 'eligible' AND c.hand_sent_at IS NULL
  AND ((c.kind <> 'held' AND c.on_held_tracker = 0) OR (SELECT value FROM outreach_settings WHERE key = 'held_hand_list_received') = '1')
  AND (SELECT value FROM outreach_settings WHERE key = 'paused') = '0'
  AND (SELECT COUNT(*) FROM outreach_sends WHERE claimed_at >= ?5 AND status IN ('claimed','sent'))
      < MIN(${HARD_DAILY_MAX}, MAX(0, CAST(COALESCE((SELECT value FROM outreach_settings WHERE key = 'daily_cap'), '0') AS INTEGER)))
  AND NOT EXISTS (SELECT 1 FROM outreach_sends WHERE recipient_domain = ?1 AND claimed_at >= ?6 AND status IN ('claimed','sent'))
  AND (SELECT COUNT(*) FROM outreach_sends WHERE contact_email = lower(c.contact_email)) < ${LIFETIME_MAX_PER_CONTACT}
  AND NOT EXISTS (SELECT 1 FROM suppressions WHERE (kind = 'address' AND value = lower(c.contact_email)) OR (kind = 'domain' AND value = ?1))
  AND (instr(c.tool_slug, '#') > 0 OR c.tool_slug NOT IN (${KNOWN_SHARED_SQL}))
  AND EXISTS (SELECT 1 FROM card_gate g WHERE g.tool_slug = c.tool_slug AND ${CARD_GATE_OPEN_SQL})`;

export async function claimSend(db: D1Database, c: { contact: ContactRow; kind: "initial" | "followup"; recipientDomain: string }, now: Date): Promise<boolean> {
  const since = iso(new Date(now.getTime() - DOMAIN_GAP_DAYS * DAY));
  const r = await db.prepare(CLAIM_SQL).bind(c.recipientDomain.toLowerCase(), c.kind, iso(now), c.contact.id, dayStartIso(now), since, freshSince(now)).run();
  return r.meta.changes === 1;
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
      // Step (f): at most ONE test copy per UTC day, whatever triggers the run.
      const testsToday = (await env.DB.prepare("SELECT COUNT(*) AS n FROM outreach_test_sends WHERE sent_at >= ?").bind(dayStartIso(now)).first<number>("n")) ?? 0;
      if (testsToday >= TEST_SENDS_PER_DAY) { out.reason = "test_send_already_today"; break; }
      const r = await env.EMAIL_TEST.send({ from: FROM, to: "elliotink@pm.me", replyTo: REPLY_TO, subject: `[TEST] ${e.subject}`, text: e.text });
      await env.DB.prepare("INSERT INTO outreach_test_sends (contact_id, kind, message_id, sent_at) VALUES (?, ?, ?, ?)").bind(c.contact.id, c.kind, r.messageId ?? null, iso(now)).run();
      out.sent.push({ tool_slug: c.contact.tool_slug, kind: c.kind, message_id: r.messageId ?? null, recipient_domain: "pm.me" });
      log({ event: "test_sent", tool_slug: c.contact.tool_slug, recipient_domain: "pm.me", message_id: r.messageId });
      continue;
    }
    if (!env.EMAIL) { out.reason = "no_send_binding"; break; }
    // Idempotency + MF1: one atomic conditional claim; send only if it inserted.
    if (!(await claimSend(env.DB, c, now))) { out.skipped.push({ tool_slug: c.contact.tool_slug, reason: "claim_refused" }); continue; }
    try {
      const r = await env.EMAIL.send({ from: FROM, to: c.contact.contact_email, replyTo: REPLY_TO, subject: e.subject, text: e.text });
      await env.DB.prepare("UPDATE outreach_sends SET status = 'sent', message_id = ?, sent_at = ? WHERE tool_slug = ? AND contact_email = ? AND kind = ?").bind(r.messageId ?? null, iso(new Date()), c.contact.tool_slug, c.contact.contact_email.toLowerCase(), c.kind).run();
      out.sent.push({ tool_slug: c.contact.tool_slug, kind: c.kind, message_id: r.messageId ?? null, recipient_domain: c.recipientDomain });
      log({ event: "sent", tool_slug: c.contact.tool_slug, recipient_domain: c.recipientDomain, message_id: r.messageId });
    } catch (err) {
      // The claim row stays: a failed or unknown send is never retried automatically.
      const code = (err as { code?: string }).code ?? "send_error";
      await env.DB.prepare("UPDATE outreach_sends SET status = 'failed', error_code = ? WHERE tool_slug = ? AND contact_email = ? AND kind = ?").bind(String(code).slice(0, 60), c.contact.tool_slug, c.contact.contact_email.toLowerCase(), c.kind).run();
      // SF3: async bounces go to cf-bounce.mail.* (Cloudflare), not privacy@, so
      // the reply Worker rarely sees them. A synchronous rejection that names a
      // bounced/suppressed/invalid recipient suppresses the address here.
      if (/bounce|suppress|invalid.?recipient|recipient.?(?:rejected|invalid|not.?found)|mailbox/i.test(`${code} ${(err as Error).message ?? ""}`))
        await env.DB.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('address', ?, 'bounce')").bind(c.contact.contact_email.toLowerCase()).run();
      log({ event: "send_failed", tool_slug: c.contact.tool_slug, recipient_domain: c.recipientDomain });
    }
  }
  return out;
}
