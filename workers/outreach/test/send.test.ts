import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "../../test-utils/d1shim";
import { handleAdmin } from "../src/admin";
import { cardGate, claimSend, checkContact, FROM, HARD_DAILY_MAX, planDay, REPLY_TO, runDaily } from "../src/send";
import { readFileSync } from "node:fs";
import { buildLoad, INITIAL_LOAD_PAUSE_REASON, parseCsv, parseRecheck, parseSteward, toSql, verdictRefreshSql } from "../src/loader";

const MIG = new URL("../migrations/0001_outreach.sql", import.meta.url).pathname;
const NOW = new Date("2026-12-01T09:00:00Z");
const TOKEN = "t".repeat(40);

function addContact(raw: any, o: Partial<Record<string, any>> = {}) {
  const slug = o.tool_slug ?? "alpha.example.com";
  const c = { tool_slug: slug, tool_name: o.tool_name ?? "Alpha", tool_domain: slug, kind: o.kind ?? "ambiguous_live", contact_email: o.contact_email ?? `privacy@${slug}`, role: "privacy", contact_source_url: o.contact_source_url ?? `https://${slug}/privacy`, policy_url: `https://${slug}/privacy`, policy_label: "Privacy Policy", question_text: "We reviewed your Privacy Policy. It does not say whether customer data is used to train AI models.", vetted_by: "test", vetted_at: "2026-11-10", domain_match_exception: o.domain_match_exception ?? null, status: o.status ?? "eligible", hand_sent_at: o.hand_sent_at ?? null, hand_sent_source: o.hand_sent_source ?? null };
  const r = raw.prepare(`INSERT INTO outreach_contacts (${Object.keys(c).join(",")}) VALUES (${Object.keys(c).map(() => "?").join(",")})`).run(...Object.values(c));
  return Number(r.lastInsertRowid);
}
// Test gate rows: an unclear live card with a mirror that never goes stale
// within these multi-month simulations (freshness has its own tests below).
const FAR = "2099-01-01T00:00:00.000Z";
function gate(raw: any, slug: string, passes: 0 | 1, reason = passes ? "pass: test" : "blocked: test", confirmed = 0, o: { basis?: string; live?: string | null; atLoad?: string | null; asOf?: string | null } = {}) {
  raw.prepare("INSERT INTO card_gate (tool_slug, flagged, passes, gate_reason, card_confirmed, confirmed_by, confirmed_at, flag_source, basis, verdict_at_load, live_verdict, verdict_as_of) VALUES (?, 1, ?, ?, ?, ?, ?, 'test', ?, ?, ?, ?)")
    .run(slug, passes, reason, confirmed, confirmed ? "Elliot" : null, confirmed ? "2026-11-10" : null, o.basis ?? (passes ? "unclear_live" : "blocked"), o.atLoad === undefined ? "unrated" : o.atLoad, o.live === undefined ? "unrated" : o.live, o.asOf === undefined ? FAR : o.asOf);
}
function sendMock() {
  return { send: vi.fn(async () => ({ messageId: `<m${Math.random().toString(36).slice(2)}@mail.getpolicypeek.com>` })) };
}
function live(db: any, extra: Record<string, unknown> = {}) {
  db.raw.prepare("UPDATE outreach_settings SET value = '0' WHERE key = 'paused'").run();
  db.raw.prepare("UPDATE outreach_settings SET value = '1' WHERE key = 'held_hand_list_received'").run();
  return { DB: db.d1, EMAIL: sendMock(), EMAIL_TEST: sendMock(), OUTREACH_ENABLED: "true", OUTREACH_MODE: "live", ...extra } as any;
}

let db: ReturnType<typeof makeDb>;
beforeEach(() => { db = makeDb(MIG); });

describe("gate 3: kill switch, paused flag, dry-run default", () => {
  it("defaults: D1 paused, cap 5, dry-run => nothing sent", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const EMAIL = sendMock();
    const r = await runDaily({ DB: db.d1, EMAIL } as any, NOW);
    expect(r.mode).toBe("dry_run");
    expect(r.rendered).toHaveLength(1);
    expect(r.rendered[0].card_gate).toMatch(/^pass: test \[live verdict unrated/);
    expect(EMAIL.send).not.toHaveBeenCalled();
  });
  it("live mode still sends nothing unless OUTREACH_ENABLED=true AND paused=0", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const EMAIL = sendMock();
    expect((await runDaily({ DB: db.d1, EMAIL, OUTREACH_MODE: "live" } as any, NOW)).reason).toBe("OUTREACH_ENABLED_not_true");
    expect((await runDaily({ DB: db.d1, EMAIL, OUTREACH_MODE: "live", OUTREACH_ENABLED: "true" } as any, NOW)).reason).toBe("d1_paused");
    expect(EMAIL.send).not.toHaveBeenCalled();
  });
  it("test mode sends only via the pinned test binding, [TEST] subject, never counted as real", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db, { OUTREACH_MODE: "test" });
    const r = await runDaily(env, NOW);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(env.EMAIL_TEST.send).toHaveBeenCalledTimes(1);
    expect((env.EMAIL_TEST.send.mock.calls[0] as any)[0]).toMatchObject({ to: "elliotink@pm.me", replyTo: "privacy@getpolicypeek.com" });
    expect((env.EMAIL_TEST.send.mock.calls[0] as any)[0].subject.startsWith("[TEST] ")).toBe(true);
    expect(r.sent).toHaveLength(1);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM outreach_sends").get().n).toBe(0);
  });
});

describe("gate 3: caps and idempotency", () => {
  it("cap: default 5 (Elliot 11:20 UK); any D1 value clamped to the hard max of 5", async () => {
    expect(HARD_DAILY_MAX).toBe(5);
    expect(db.raw.prepare("SELECT value FROM outreach_settings WHERE key = 'daily_cap'").get().value).toBe("5");
    for (let i = 0; i < 12; i++) { const s = `t${i}.example`; addContact(db.raw, { tool_slug: s }); gate(db.raw, s, 1); }
    const env = live(db);
    expect((await runDaily(env, NOW)).sent).toHaveLength(5);
    expect((await runDaily(env, NOW)).sent).toHaveLength(0); // 5 already today
    db.raw.prepare("UPDATE outreach_settings SET value = '50' WHERE key = 'daily_cap'").run();
    expect((await planDay(db.d1, NOW)).cap).toBe(HARD_DAILY_MAX);
    expect((await runDaily(env, NOW)).sent).toHaveLength(0); // still 5, never more
    db.raw.prepare("UPDATE outreach_settings SET value = '2' WHERE key = 'daily_cap'").run();
    expect((await planDay(db.d1, new Date(NOW.getTime() + 86400000))).cap).toBe(2); // a lower value is respected
  });
  it("<= 1 per recipient domain per 14 days", async () => {
    addContact(db.raw, { tool_slug: "a.example.com", contact_email: "privacy@a.example.com" });
    addContact(db.raw, { tool_slug: "example.com", tool_name: "B", contact_email: "legal@example.com" });
    gate(db.raw, "a.example.com", 1); gate(db.raw, "example.com", 1);
    const env = live(db);
    expect((await runDaily(env, NOW)).sent).toHaveLength(1);
    expect((await runDaily(env, new Date(NOW.getTime() + 13 * 86400000))).sent).toHaveLength(0);
  });
  it("UNIQUE claim before send: a pre-existing claim row means no send", async () => {
    const id = addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    const plan = await planDay(db.d1, NOW);
    expect(plan.queue).toHaveLength(1);
    db.raw.prepare("INSERT INTO outreach_sends (contact_id, tool_slug, contact_email, recipient_domain, kind, status, claimed_at) VALUES (?, 'alpha.example.com', 'privacy@alpha.example.com', 'example.com', 'initial', 'claimed', ?)").run(id, NOW.toISOString());
    await runDaily(env, NOW);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it("exactly one follow-up, 14 days after the initial, cancelled by a reply; lifetime max 2", async () => {
    const id = addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    await runDaily(env, NOW);
    expect((await runDaily(env, new Date(NOW.getTime() + 13 * 86400000))).sent).toHaveLength(0);
    const r = await runDaily(env, new Date(NOW.getTime() + 15 * 86400000));
    expect(r.sent.map((s) => s.kind)).toEqual(["followup"]);
    expect((await runDaily(env, new Date(NOW.getTime() + 60 * 86400000))).sent).toHaveLength(0);
    expect(env.EMAIL.send).toHaveBeenCalledTimes(2);
    // a matched reply cancels a due follow-up
    const id2 = addContact(db.raw, { tool_slug: "beta.example.org", tool_name: "Beta" }); gate(db.raw, "beta.example.org", 1);
    const t0 = new Date(NOW.getTime() + 61 * 86400000);
    await runDaily(env, t0);
    db.raw.prepare("INSERT INTO outreach_replies (matched_contact_id, from_domain, received_at, classification, raw_size) VALUES (?, 'example.org', ?, 'reply', 10)").run(id2, t0.toISOString());
    expect((await runDaily(env, new Date(t0.getTime() + 15 * 86400000))).sent).toHaveLength(0);
    expect(id).toBe(1);
  });
  it("a failed send is not retried", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    env.EMAIL.send.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "E_RATE_LIMIT" }));
    await runDaily(env, NOW);
    await runDaily(env, new Date(NOW.getTime() + 86400000));
    expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
    expect(db.raw.prepare("SELECT status, error_code FROM outreach_sends").get()).toMatchObject({ status: "failed", error_code: "E_RATE_LIMIT" });
  });
});

describe("hand-sent (11:37 UK) and held pause", () => {
  it("sent_by_hand contacts never get an initial OR a follow-up", async () => {
    addContact(db.raw, { tool_slug: "zerodeposit.com", tool_name: "Zero Deposit", kind: "held", contact_email: "compliance@zerodeposit.com", status: "sent_by_hand", hand_sent_at: "2026-11-10", hand_sent_source: "Elliot, by hand" });
    gate(db.raw, "zerodeposit.com", 1, "pass: held tool");
    const env = live(db);
    for (const d of [0, 15, 30]) await runDaily(env, new Date(NOW.getTime() + d * 86400000));
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect((await planDay(db.d1, NOW)).skipped).toContainEqual({ tool_slug: "zerodeposit.com", reason: "sent_by_hand" });
  });
  it("held contacts stay out of the queue until the hand-sent list is marked received", async () => {
    addContact(db.raw, { kind: "held" }); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    db.raw.prepare("UPDATE outreach_settings SET value = '0' WHERE key = 'held_hand_list_received'").run();
    expect((await runDaily(env, NOW)).skipped).toContainEqual({ tool_slug: "alpha.example.com", reason: "held_awaiting_hand_sent_list" });
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it("the schema refuses sent_by_hand without a date and source", () => {
    expect(() => addContact(db.raw, { status: "sent_by_hand" })).toThrow();
  });
});

describe("card gate (11:32 / 11:39 UK)", () => {
  it("flagged tool, gate blocked, unconfirmed => never queued or sent", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 0, "blocked: Research says no email needed");
    const env = live(db);
    const r = await runDaily(env, NOW);
    expect(r.planned).toBe(0);
    expect(r.skipped[0].reason).toMatch(/card_gate blocked: Research says no email needed/);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it("flagged tool confirmed by an admin => queued, and the dry run shows why", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 0, "blocked: flagged", 1);
    expect(await cardGate(db.d1, "alpha.example.com", NOW)).toEqual({ open: true, reason: "pass: card confirmed by Elliot" });
    expect((await runDaily(live(db), NOW)).sent).toHaveLength(1);
  });
  it("tool that isn't flagged (or proposes held) => normal rules", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1, "pass: live card not flagged by the audit");
    expect((await runDaily(live(db), NOW)).sent).toHaveLength(1);
  });
  it("fail closed: no card_gate row => never queued or sent", async () => {
    addContact(db.raw);
    const env = live(db);
    const r = await runDaily(env, NOW);
    expect(r.planned).toBe(0);
    expect(r.skipped[0].reason).toMatch(/no card_gate row \(fail closed\)/);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
  it("re-checked immediately before each send (gate closed after queueing => no send)", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    const origPrepare = db.d1.prepare;
    // Planning reads card_gate twice (follow-up pass, initial pass); close the
    // gate just before the third read, i.e. the pre-send re-check.
    let reads = 0;
    (db.d1 as any).prepare = (sql: string) => {
      if (sql.startsWith("SELECT passes") && ++reads === 3) db.raw.prepare("UPDATE card_gate SET passes = 0, gate_reason = 'blocked: changed'").run();
      return origPrepare(sql);
    };
    const r = await runDaily(env, NOW);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(r.skipped.some((s) => s.reason.startsWith("precheck_card_gate"))).toBe(true);
  });
  it("only the admin endpoint sets card_confirmed, and it needs the token", async () => {
    gate(db.raw, "alpha.example.com", 0);
    const req = (tok?: string) => new Request("https://x/admin/card-confirm", { method: "POST", headers: tok ? { "X-Admin-Token": tok } : {}, body: JSON.stringify({ tool_slug: "alpha.example.com", confirmed_by: "Elliot" }) });
    expect((await handleAdmin(req(), { DB: db.d1, OUTREACH_ADMIN_TOKEN: TOKEN })).status).toBe(401);
    expect((await handleAdmin(req("wrong"), { DB: db.d1, OUTREACH_ADMIN_TOKEN: TOKEN })).status).toBe(401);
    expect((await handleAdmin(req(TOKEN), { DB: db.d1, OUTREACH_ADMIN_TOKEN: TOKEN }, NOW)).status).toBe(200);
    expect(db.raw.prepare("SELECT card_confirmed, confirmed_by, confirmed_at FROM card_gate").get()).toEqual({ card_confirmed: 1, confirmed_by: "Elliot", confirmed_at: NOW.toISOString() });
  });
  it("there is no HTTP send route and no HTTP unpause", async () => {
    for (const p of ["/admin/send", "/send", "/admin/unpause", "/admin/run"]) {
      const res = await handleAdmin(new Request(`https://x${p}`, { method: "POST", headers: { "X-Admin-Token": TOKEN } }), { DB: db.d1, OUTREACH_ADMIN_TOKEN: TOKEN });
      expect(res.status).toBe(404);
    }
  });
});

describe("template checks at queue time", () => {
  it("a contact whose stored wording fails the template checks is skipped, and the run carries on", async () => {
    addContact(db.raw, { tool_slug: "a.example" }); gate(db.raw, "a.example", 1);
    db.raw.prepare("UPDATE outreach_contacts SET question_text = 'Since you train on customer data, which plans are affected?' WHERE tool_slug = 'a.example'").run();
    addContact(db.raw, { tool_slug: "b.example", tool_name: "B" }); gate(db.raw, "b.example", 1);
    const env = live(db);
    const r = await runDaily(env, NOW);
    expect(r.skipped[0]).toMatchObject({ tool_slug: "a.example" });
    expect(r.skipped[0].reason).toMatch(/^template_implies_training/);
    expect(r.sent.map((s) => s.tool_slug)).toEqual(["b.example"]);
  });
});

describe("gate 5: suppression by address and domain", () => {
  it("address suppression and domain suppression both block", async () => {
    addContact(db.raw, { tool_slug: "a.example.com" }); gate(db.raw, "a.example.com", 1);
    addContact(db.raw, { tool_slug: "b.example.net", tool_name: "B" }); gate(db.raw, "b.example.net", 1);
    db.raw.prepare("INSERT INTO suppressions (kind, value, reason) VALUES ('address', 'privacy@a.example.com', 'objection'), ('domain', 'example.net', 'objection')").run();
    const env = live(db);
    const r = await runDaily(env, NOW);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(r.skipped.map((s) => s.reason)).toEqual(["suppressed", "suppressed"]);
  });
});

describe("sender identity (11:57 UK)", () => {
  it("From privacy@mail.getpolicypeek.com, Reply-To privacy@getpolicypeek.com, in code, bindings and every real send", async () => {
    expect(FROM).toEqual({ email: "privacy@mail.getpolicypeek.com", name: "PolicyPeek" });
    expect(REPLY_TO).toBe("privacy@getpolicypeek.com");
    const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
    const senders = [...cfg.matchAll(/"allowed_sender_addresses":\s*\[([^\]]*)\]/g)].map((m) => m[1].trim());
    expect(senders.length).toBeGreaterThanOrEqual(2);
    for (const s of senders) expect(s).toBe('"privacy@mail.getpolicypeek.com"');
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db);
    await runDaily(env, NOW);
    expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
    const msg = (env.EMAIL.send.mock.calls[0] as any)[0];
    expect(msg.from).toEqual({ email: "privacy@mail.getpolicypeek.com", name: "PolicyPeek" });
    expect(msg.replyTo).toBe("privacy@getpolicypeek.com");
    expect(msg.text).toContain("https://getpolicypeek.com/privacy");
  });
});

describe("parent-company exception at send time (11:57 UK)", () => {
  it("a listed exception sends only when the row records its reason", async () => {
    const o = { tool_slug: "poe.com", tool_name: "Poe", contact_email: "privacy@quora.com", contact_source_url: "https://poe.com/pages/privacy" };
    addContact(db.raw, o); gate(db.raw, "poe.com", 1);
    expect((await planDay(db.d1, NOW)).skipped).toEqual([{ tool_slug: "poe.com", reason: "vet_domain_match_exception_not_recorded" }]);
    db.raw.prepare("UPDATE outreach_contacts SET domain_match_exception = 'parent company' WHERE tool_slug = 'poe.com'").run();
    expect((await planDay(db.d1, NOW)).queue).toHaveLength(1);
  });
  it("a recorded reason alone never opens an unlisted parent domain", async () => {
    addContact(db.raw, { tool_slug: "t1.example", contact_email: "privacy@parent.example", domain_match_exception: "parent company" }); gate(db.raw, "t1.example", 1);
    const r = await planDay(db.d1, NOW);
    expect(r.queue).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/^vet_domain_mismatch/);
  });
});

describe("MF2: lifetime max 2 per contact address, across all tools", () => {
  it("one address shared by three tools gets at most 2 emails in total, ever", async () => {
    for (const [slug, name] of [["t1.example", "T1"], ["t2.example", "T2"], ["t3.example", "T3"]]) {
      addContact(db.raw, { tool_slug: slug, tool_name: name, contact_email: "privacy@parent.example", contact_source_url: "https://parent.example/privacy" });
      gate(db.raw, slug, 1);
    }
    const env = live(db);
    let total = 0;
    // domain gap is 14 days, so step 15 days at a time for a year
    for (let d = 0; d < 365; d += 15) total += (await runDaily(env, new Date(NOW.getTime() + d * 86400000))).sent.length;
    expect(total).toBe(2);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM outreach_sends WHERE contact_email = 'privacy@parent.example'").get().n).toBe(2);
  });
  it("case differences in the address do not reset the count", async () => {
    addContact(db.raw, { tool_slug: "t1.example", tool_name: "T1", contact_email: "Privacy@Parent.example", contact_source_url: "https://parent.example/privacy" }); gate(db.raw, "t1.example", 1);
    addContact(db.raw, { tool_slug: "t2.example", tool_name: "T2", contact_email: "privacy@parent.example", contact_source_url: "https://parent.example/privacy" }); gate(db.raw, "t2.example", 1);
    addContact(db.raw, { tool_slug: "t3.example", tool_name: "T3", contact_email: "PRIVACY@parent.example", contact_source_url: "https://parent.example/privacy" }); gate(db.raw, "t3.example", 1);
    const env = live(db);
    let total = 0;
    for (let d = 0; d < 120; d += 15) total += (await runDaily(env, new Date(NOW.getTime() + d * 86400000))).sent.length;
    expect(total).toBe(2);
  });
});

describe("MF1: daily cap and 14-day domain claim are one atomic conditional INSERT", () => {
  async function candidates(n: number, now = NOW) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const slug = `c${i}.example`;
      const id = addContact(db.raw, { tool_slug: slug, tool_name: `C${i}` }); gate(db.raw, slug, 1);
      const contact = db.raw.prepare("SELECT * FROM outreach_contacts WHERE id = ?").get(id);
      const r = await checkContact(db.d1, contact, "initial", now);
      if (!r.ok) throw new Error(r.reason);
      out.push({ contact, kind: "initial" as const, recipientDomain: r.recipientDomain });
    }
    return out;
  }
  it("stale plans: 10 concurrent claims for 10 different domains => exactly 5 succeed", async () => {
    live(db);
    const qs = await candidates(10); // all planned while 0 had been sent today
    const results = await Promise.all(qs.map((q) => claimSend(db.d1, q, NOW)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM outreach_sends").get().n).toBe(5);
  });
  it("two contacts on one domain claimed concurrently => only one wins", async () => {
    live(db);
    const a = addContact(db.raw, { tool_slug: "a.shared.example", tool_name: "A", contact_email: "privacy@shared.example", contact_source_url: "https://shared.example/p" }); gate(db.raw, "a.shared.example", 1);
    const b = addContact(db.raw, { tool_slug: "b.shared.example", tool_name: "B", contact_email: "legal@shared.example", contact_source_url: "https://shared.example/p" }); gate(db.raw, "b.shared.example", 1);
    const q = (id: number) => ({ contact: db.raw.prepare("SELECT * FROM outreach_contacts WHERE id = ?").get(id), kind: "initial" as const, recipientDomain: "shared.example" });
    const r = await Promise.all([claimSend(db.d1, q(a), NOW), claimSend(db.d1, q(b), NOW)]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
  it("two overlapping runDaily calls (cron retry + manual trigger) never exceed 5/day or 1/domain", async () => {
    for (let i = 0; i < 9; i++) { const s = `r${i}.example`; addContact(db.raw, { tool_slug: s, tool_name: `R${i}` }); gate(db.raw, s, 1); }
    addContact(db.raw, { tool_slug: "x.r0.example", tool_name: "X", contact_email: "legal@r0.example", contact_source_url: "https://r0.example/p" }); gate(db.raw, "x.r0.example", 1);
    const env = live(db);
    env.EMAIL.send = vi.fn(async () => { await new Promise((r) => setTimeout(r, 1)); return { messageId: `<m${Math.random()}@mail.getpolicypeek.com>` }; });
    const [r1, r2] = await Promise.all([runDaily(env, NOW), runDaily(env, NOW)]);
    expect(r1.sent.length + r2.sent.length).toBe(5);
    expect(env.EMAIL.send).toHaveBeenCalledTimes(5);
    const doms = db.raw.prepare("SELECT recipient_domain d FROM outreach_sends").all().map((x: any) => x.d);
    expect(new Set(doms).size).toBe(doms.length);
  });
  it("the claim itself re-checks the kill switch, suppression, cap value and card gate", async () => {
    const [q] = await candidates(1);
    expect(await claimSend(db.d1, q, NOW)).toBe(false); // paused='1' by default
    live(db);
    db.raw.prepare("INSERT INTO suppressions (kind, value, reason) VALUES ('domain', 'c0.example', 'objection')").run();
    expect(await claimSend(db.d1, q, NOW)).toBe(false);
    db.raw.prepare("DELETE FROM suppressions").run();
    db.raw.prepare("UPDATE outreach_settings SET value = '0' WHERE key = 'daily_cap'").run();
    expect(await claimSend(db.d1, q, NOW)).toBe(false);
    db.raw.prepare("UPDATE outreach_settings SET value = 'abc' WHERE key = 'daily_cap'").run();
    expect(await claimSend(db.d1, q, NOW)).toBe(false);
    db.raw.prepare("UPDATE outreach_settings SET value = '5' WHERE key = 'daily_cap'").run();
    db.raw.prepare("UPDATE card_gate SET passes = 0").run();
    expect(await claimSend(db.d1, q, NOW)).toBe(false);
    db.raw.prepare("UPDATE card_gate SET passes = 1").run();
    expect(await claimSend(db.d1, q, NOW)).toBe(true);
  });
});

describe("MF8: sender refuses a gate keyed on a bare shared domain", () => {
  it("a 'google.com' row is blocked even with passes=1; 'google.com#gemini' works", async () => {
    addContact(db.raw, { tool_slug: "google.com", tool_name: "Gemini", contact_email: "privacy@google.com", contact_source_url: "https://policies.google.com/privacy" }); gate(db.raw, "google.com", 1);
    expect((await cardGate(db.d1, "google.com")).open).toBe(false);
    const env = live(db);
    expect((await runDaily(env, NOW)).sent).toHaveLength(0);
    db.raw.prepare("UPDATE outreach_contacts SET tool_slug = 'google.com#gemini'").run();
    db.raw.prepare("UPDATE card_gate SET tool_slug = 'google.com#gemini'").run();
    expect((await runDaily(env, NOW)).sent).toHaveLength(1);
  });
  it("admin card-confirm accepts per-tool keys", async () => {
    gate(db.raw, "vercel.com#v0", 0);
    const res = await handleAdmin(new Request("https://x/admin/card-confirm", { method: "POST", headers: { "X-Admin-Token": TOKEN }, body: JSON.stringify({ tool_slug: "vercel.com#v0", confirmed_by: "Elliot" }) }), { DB: db.d1, OUTREACH_ADMIN_TOKEN: TOKEN }, NOW);
    expect(res.status).toBe(200);
  });
});

describe("MF7/MF9: the gate reads the mirrored LIVE verdict, not the static steward file", () => {
  const T = NOW;
  const fresh = new Date(T.getTime() - 3600_000).toISOString();
  const stale = new Date(T.getTime() - 48 * 3600_000).toISOString();
  it("unclear_live opens only while the live verdict is unclear/held and the mirror is fresh", async () => {
    gate(db.raw, "u.example", 1, "pass: x", 0, { basis: "unclear_live", live: "unrated", asOf: fresh });
    expect((await cardGate(db.d1, "u.example", T)).open).toBe(true);
    db.raw.prepare("UPDATE card_gate SET live_verdict = 'not_compliant'").run();
    expect(await cardGate(db.d1, "u.example", T)).toMatchObject({ open: false, reason: expect.stringMatching(/not held\/unclear/) });
    db.raw.prepare("UPDATE card_gate SET live_verdict = 'unrated', verdict_as_of = ?").run(stale);
    expect(await cardGate(db.d1, "u.example", T)).toMatchObject({ open: false, reason: expect.stringMatching(/not refreshed today/) });
    db.raw.prepare("UPDATE card_gate SET verdict_as_of = NULL").run();
    expect((await cardGate(db.d1, "u.example", T)).open).toBe(false);
  });
  it("steward_held closes if the live verdict changes after review", async () => {
    gate(db.raw, "s.example", 1, "pass: steward", 0, { basis: "steward_held", atLoad: "not_compliant", live: "not_compliant", asOf: fresh });
    expect((await cardGate(db.d1, "s.example", T)).open).toBe(true);
    db.raw.prepare("UPDATE card_gate SET live_verdict = 'compliant'").run();
    expect(await cardGate(db.d1, "s.example", T)).toMatchObject({ open: false, reason: expect.stringMatching(/changed since review/) });
  });
  it("held_tracker closes if the tool is published with a definite verdict", async () => {
    gate(db.raw, "h.example", 1, "pass: held", 0, { basis: "held_tracker", atLoad: "unpublished", live: "unpublished", asOf: fresh });
    expect((await cardGate(db.d1, "h.example", T)).open).toBe(true);
    db.raw.prepare("UPDATE card_gate SET live_verdict = 'compliant_with_caveats'").run();
    expect((await cardGate(db.d1, "h.example", T)).open).toBe(false);
  });
  it("the atomic claim applies the same live-verdict rule (no send on a stale or changed mirror)", async () => {
    addContact(db.raw, { tool_slug: "u.example", tool_name: "U" });
    gate(db.raw, "u.example", 1, "pass: x", 0, { basis: "unclear_live", live: "unrated", asOf: stale });
    const env = live(db);
    expect((await runDaily(env, T)).sent).toHaveLength(0);
    db.raw.prepare("UPDATE card_gate SET verdict_as_of = ?").run(fresh);
    expect((await runDaily(env, T)).sent).toHaveLength(1);
  });
  it("card_confirmed (Elliot, admin route) still opens regardless of the mirror", async () => {
    gate(db.raw, "c.example", 0, "blocked: x", 1, { live: "compliant", asOf: null });
    expect((await cardGate(db.d1, "c.example", T)).open).toBe(true);
  });
});

describe("MF10: sender blocks any on-tracker tool until the hand-sent list arrives", () => {
  it("an ambiguous_live row with on_held_tracker=1 is never queued or claimed while held_hand_list_received='0', even if someone sets it eligible", async () => {
    const id = addContact(db.raw, { tool_slug: "mailchimp.com", tool_name: "Mailchimp", contact_email: "privacy@intuit.com", contact_source_url: "https://mailchimp.com/about/privacy-rights/", domain_match_exception: "parent company" });
    db.raw.prepare("UPDATE outreach_contacts SET on_held_tracker = 1 WHERE id = ?").run(id);
    gate(db.raw, "mailchimp.com", 1);
    const env = live(db);
    db.raw.prepare("UPDATE outreach_settings SET value = '0' WHERE key = 'held_hand_list_received'").run();
    const r = await runDaily(env, NOW);
    expect(r.skipped).toContainEqual({ tool_slug: "mailchimp.com", reason: "held_awaiting_hand_sent_list" });
    const contact = db.raw.prepare("SELECT * FROM outreach_contacts WHERE id = ?").get(id);
    expect(await claimSend(db.d1, { contact, kind: "initial", recipientDomain: "intuit.com" }, NOW)).toBe(false);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
  });
});

describe("Jump 12:07: Mailchimp stays out of the first live run (MF9 + MF10)", () => {
  const tracker = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nMailchimp,form only: https://mailchimp.com/privacy-rights/,https://mailchimp.com/privacy-rights/,2026-11-10,drafted,2026-11-24,\n");
  const flags = parseCsv("tool,contact,contact_source_url\nMailchimp,privacy@intuit.com,https://mailchimp.com/about/privacy-rights/\nBuffer,privacy@buffer.com,https://buffer.com/legal#privacy-policy\n");
  const rc = parseRecheck("| 1 | Mailchimp (mailchimp.com) | x | y | Yes |\n| 2 | Buffer (buffer.com) | x | y | Yes |\n### 1. Mailchimp (mailchimp.com)\n> We may use your Inputs and Outputs for machine learning purposes.\nSource: https://mailchimp.com/about/privacy-rights/ — x\n### 2. Buffer (buffer.com)\n> We may use data to improve features.\nSource: https://buffer.com/legal#privacy-policy — x\n");
  const st = parseSteward("1. **Mailchimp** — not_compliant → held — **APPROVE.** a\n2. **Buffer** — held (unchanged) — **APPROVE.** b\n");
  function loadFirstRun(mailchimpVerdict: string, asOf: string) {
    const liveTools = [{ domain: "mailchimp.com", name: "Mailchimp", source_urls: "[]", compliance_status: mailchimpVerdict }, { domain: "buffer.com", name: "Buffer", source_urls: "[]", compliance_status: "unrated" }];
    const r = buildLoad({ tracker, heldPack: new Map(), liveTools, flagCsv: flags, recheck: rc, steward: st, vettedBy: "t", verdictAsOf: asOf });
    db.raw.exec(toSql(r, "t", asOf));
    // Elliot-approved unpause for the first live run: only the initial-load pauses.
    db.raw.prepare("UPDATE outreach_contacts SET status = 'eligible', paused_reason = NULL WHERE paused_reason = ?").run(INITIAL_LOAD_PAUSE_REASON);
    return r;
  }
  it("before the hand-sent list: Buffer goes, Mailchimp does not (stale not_compliant export AND fresh unrated export)", async () => {
    for (const v of ["not_compliant", "unrated"]) {
      db = makeDb(MIG);
      loadFirstRun(v, new Date(NOW.getTime() - 3600_000).toISOString());
      const env = live(db, {});
      db.raw.prepare("UPDATE outreach_settings SET value = '0' WHERE key = 'held_hand_list_received'").run();
      const r = await runDaily(env, NOW);
      expect(r.sent.map((s) => s.tool_slug)).toEqual(["buffer.com"]);
      expect(env.EMAIL.send.mock.calls.map((c: any) => c[0].to)).not.toContain("privacy@intuit.com");
    }
  });
  it("even if the hand-sent list arrives and someone unpauses Mailchimp, a not_compliant stored verdict still blocks it (MF9)", async () => {
    loadFirstRun("not_compliant", new Date(NOW.getTime() - 3600_000).toISOString());
    db.raw.prepare("UPDATE outreach_contacts SET status = 'eligible', paused_reason = NULL").run();
    const env = live(db); // held_hand_list_received = '1'
    const r = await runDaily(env, NOW);
    expect(r.sent.map((s) => s.tool_slug)).not.toContain("mailchimp.com");
    expect(r.skipped.find((s) => s.tool_slug === "mailchimp.com")?.reason).toMatch(/card_gate blocked: owner ruling unclear/);
  });
  it("a verdict refresh alone cannot flip a stale steward 'held' into a send: the old load's gate stays closed", async () => {
    loadFirstRun("not_compliant", new Date(NOW.getTime() - 3600_000).toISOString());
    db.raw.exec(verdictRefreshSql([{ tool_slug: "mailchimp.com", verdict_at_load: "not_compliant" }, { tool_slug: "buffer.com", verdict_at_load: "unrated" }], [{ domain: "mailchimp.com", name: "Mailchimp", source_urls: "[]", compliance_status: "unrated" }, { domain: "buffer.com", name: "Buffer", source_urls: "[]", compliance_status: "unrated" }], NOW.toISOString(), { minRows: 2, now: NOW }));
    db.raw.prepare("UPDATE outreach_contacts SET status = 'eligible', paused_reason = NULL").run();
    const r = await runDaily(live(db), NOW);
    expect(r.sent.map((s) => s.tool_slug)).not.toContain("mailchimp.com");
  });
});

describe("step (c) verify SQL", () => {
  const VERIFY = readFileSync(new URL("../sql/verify-step-c.sql", import.meta.url), "utf8");
  it("passes on the schema-only migration", () => {
    expect(() => db.raw.exec(VERIFY)).not.toThrow();
  });
  it("fails if paused != '1', the hand-sent flag is set, the cap is > 5, or any contact is eligible", () => {
    for (const bad of ["UPDATE outreach_settings SET value = '0' WHERE key = 'paused'", "UPDATE outreach_settings SET value = '1' WHERE key = 'held_hand_list_received'", "UPDATE outreach_settings SET value = '6' WHERE key = 'daily_cap'"]) {
      db = makeDb(MIG);
      db.raw.exec(bad);
      expect(() => db.raw.exec(VERIFY)).toThrow();
    }
    db = makeDb(MIG);
    addContact(db.raw);
    expect(() => db.raw.exec(VERIFY)).toThrow();
  });
});

describe("SF4 + step (f): bindings", () => {
  const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  it("no live EMAIL binding in dev or production; only EMAIL_TEST pinned to elliotink@pm.me", () => {
    expect(cfg).not.toMatch(/"name":\s*"EMAIL"/);
    const tests = [...cfg.matchAll(/\{[^{}]*"name":\s*"EMAIL_TEST"[^{}]*\}/g)].map((m) => m[0]);
    expect(tests).toHaveLength(2);
    for (const t of tests) expect(t).toMatch(/"destination_address":\s*"elliotink@pm\.me"/);
    expect([...cfg.matchAll(/"name":\s*"(EMAIL\w*)"/g)].map((m) => m[1])).toEqual(["EMAIL_TEST", "EMAIL_TEST"]);
  });
  it("defaults stay dry_run, no OUTREACH_ENABLED; crons only in production (steps d+e); prod has workers_dev false", () => {
    expect([...cfg.matchAll(/"OUTREACH_MODE":\s*"(\w+)"/g)].map((m) => m[1])).toEqual(["dry_run", "dry_run"]);
    expect(cfg).not.toMatch(/OUTREACH_ENABLED|"routes"|"route"/);
    expect(cfg).toMatch(/"production":\s*\{\s*"name":\s*"policypeek-outreach",\s*"workers_dev":\s*false/);
    const j = JSON.parse(cfg.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"));
    const prod = j.env.production;
    expect(j.triggers).toBeUndefined(); // dev has no cron
    expect(prod.triggers).toEqual({ crons: ["0 9 * * *", "30 3 * * *"] });
    expect(prod.vars).toEqual({ OUTREACH_MODE: "dry_run" });
    expect(prod.d1_databases.map((d: any) => [d.binding, d.database_name])).toEqual([["DB", "policypeek-outreach"]]);
    expect(prod.send_email).toEqual([{ name: "EMAIL_TEST", destination_address: "elliotink@pm.me", allowed_sender_addresses: ["privacy@mail.getpolicypeek.com"] }]); // no live EMAIL
    expect(Object.keys(prod).sort()).toEqual(["d1_databases", "name", "send_email", "triggers", "vars", "workers_dev"]);
  });
  it("the purge cron string in the config is the one scheduled() routes to runPurge", () => {
    expect(readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")).toMatch(/controller\.cron === "30 3 \* \* \*"/);
  });
  it("live mode with no EMAIL binding sends nothing (fails closed)", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db); delete env.EMAIL;
    const r = await runDaily(env, NOW);
    expect(r.reason).toBe("no_send_binding");
    expect(env.EMAIL_TEST.send).not.toHaveBeenCalled();
  });
  it("test mode: at most one [TEST] copy per day, even if the run is triggered again", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const env = live(db, { OUTREACH_MODE: "test" });
    await runDaily(env, NOW);
    const r2 = await runDaily(env, new Date(NOW.getTime() + 600_000));
    expect(env.EMAIL_TEST.send).toHaveBeenCalledTimes(1);
    expect(r2.reason).toBe("test_send_already_today");
  });
});

describe("SF3: a synchronous bounce/suppressed rejection suppresses the address", () => {
  it("E_RECIPIENT_SUPPRESSED => address suppression; a rate-limit error does not", async () => {
    addContact(db.raw, { tool_slug: "a.example" }); gate(db.raw, "a.example", 1);
    addContact(db.raw, { tool_slug: "b.example", tool_name: "B" }); gate(db.raw, "b.example", 1);
    const env = live(db);
    env.EMAIL.send.mockRejectedValueOnce(Object.assign(new Error("recipient is on the suppression list"), { code: "E_RECIPIENT_SUPPRESSED" }));
    env.EMAIL.send.mockRejectedValueOnce(Object.assign(new Error("slow down"), { code: "E_RATE_LIMIT" }));
    await runDaily(env, NOW);
    expect(db.raw.prepare("SELECT kind, value, reason FROM suppressions").all()).toEqual([{ kind: "address", value: "privacy@a.example", reason: "bounce" }]);
  });
});

describe("step (f) dev SQL", () => {
  const SETUP = readFileSync(new URL("../sql/step-f-setup-dev.sql", import.meta.url), "utf8");
  const REVERT = readFileSync(new URL("../sql/step-f-revert-dev.sql", import.meta.url), "utf8");
  it("one synthetic example.com contact, one [TEST] copy to elliotink@pm.me, then a clean revert", async () => {
    db.raw.exec(SETUP);
    const env = { DB: db.d1, EMAIL_TEST: sendMock(), OUTREACH_ENABLED: "true", OUTREACH_MODE: "test" } as any;
    const r = await runDaily(env, new Date());
    expect(env.EMAIL_TEST.send).toHaveBeenCalledTimes(1);
    const m = env.EMAIL_TEST.send.mock.calls[0][0];
    expect(m).toMatchObject({ to: "elliotink@pm.me", from: { email: "privacy@mail.getpolicypeek.com", name: "PolicyPeek" }, replyTo: "privacy@getpolicypeek.com" });
    expect(m.subject.startsWith("[TEST] ")).toBe(true);
    expect(m.text).toContain("https://getpolicypeek.com/privacy");
    expect(m.text).toContain('reply "stop"');
    expect(r.sent).toHaveLength(1);
    db.raw.exec(REVERT);
    expect(db.raw.prepare("SELECT value FROM outreach_settings WHERE key = 'paused'").get().value).toBe("1");
  });
  it("setup refuses a dev DB that already holds contacts", () => {
    addContact(db.raw);
    expect(() => db.raw.exec(SETUP)).toThrow();
  });
});

describe("MF11: a missing or empty mirrored verdict blocks; refresh must be from today", () => {
  const T = NOW; // 09:00 UTC
  for (const basis of ["held_tracker", "unclear_live", "steward_held"]) {
    it(`${basis}: NULL or '' live verdict never opens (gate and claim)`, async () => {
      for (const v of [null, ""]) {
        db = makeDb(MIG);
        addContact(db.raw, { tool_slug: "h.example", tool_name: "H" });
        gate(db.raw, "h.example", 1, "pass: x", 0, { basis, atLoad: v, live: v, asOf: new Date(T.getTime() - 600_000).toISOString() });
        expect(await cardGate(db.d1, "h.example", T)).toMatchObject({ open: false, reason: "blocked: live verdict missing (MF11)" });
        const env = live(db);
        expect((await runDaily(env, T)).sent).toHaveLength(0);
        const contact = db.raw.prepare("SELECT * FROM outreach_contacts").get();
        expect(await claimSend(db.d1, { contact, kind: "initial", recipientDomain: "h.example" }, T)).toBe(false);
      }
    });
  }
  it("a refresh from yesterday evening does not open today (refresh failed => no sends that day)", async () => {
    addContact(db.raw, { tool_slug: "u.example", tool_name: "U" });
    gate(db.raw, "u.example", 1, "pass: x", 0, { basis: "unclear_live", live: "unrated", asOf: "2026-11-30T23:30:00.000Z" });
    const env = live(db);
    expect((await runDaily(env, T)).sent).toHaveLength(0);
    db.raw.prepare("UPDATE card_gate SET verdict_as_of = '2026-12-01T07:30:00.000Z'").run();
    expect((await runDaily(env, T)).sent).toHaveLength(1);
  });
});

describe("step (f) revert deletes the TEST reply rows (Jump 12:29)", () => {
  const CLEAN = readFileSync(new URL("../sql/step-f-cleanup-prod-replies.sql", import.meta.url), "utf8");
  const REVERT = readFileSync(new URL("../sql/step-f-revert-dev.sql", import.meta.url), "utf8");
  const seed = () => {
    db.raw.exec("INSERT INTO outreach_replies (from_domain, received_at, classification, raw_size, forwarded) VALUES ('pm.me', '2026-11-10T13:00:00Z', 'reply', 10, 1), ('pm.me', '2026-11-10T13:05:00Z', 'reply', 300000, 1), ('buffer.com', '2026-11-10T13:06:00Z', 'reply', 10, 1)");
    db.raw.exec("INSERT INTO suppressions (kind, value, reason) VALUES ('address', 'elliotink@pm.me', 'objection'), ('domain', 'pm.me', 'objection'), ('domain', 'buffer.com', 'objection')");
  };
  it("prod cleanup removes only pm.me reply/suppression rows", () => {
    seed();
    db.raw.exec(CLEAN);
    expect(db.raw.prepare("SELECT from_domain FROM outreach_replies").all().map((r: any) => r.from_domain)).toEqual(["buffer.com"]);
    expect(db.raw.prepare("SELECT value FROM suppressions").all().map((r: any) => r.value)).toEqual(["buffer.com"]);
  });
  it("prod cleanup aborts if a pm.me row is matched to a real contact", () => {
    const id = addContact(db.raw);
    db.raw.prepare("INSERT INTO outreach_replies (from_domain, matched_contact_id, received_at, classification, raw_size) VALUES ('pm.me', ?, '2026-11-10T13:00:00Z', 'reply', 1)").run(id);
    expect(() => db.raw.exec(CLEAN)).toThrow();
  });
  it("dev revert also clears TEST reply rows", () => {
    seed();
    db.raw.exec(REVERT);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM outreach_replies WHERE from_domain = 'pm.me'").get().n).toBe(0);
  });
});
