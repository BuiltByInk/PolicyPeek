import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb } from "../../test-utils/d1shim";
import { handleAdmin } from "../src/admin";
import { cardGate, HARD_DAILY_MAX, planDay, runDaily } from "../src/send";

const MIG = new URL("../migrations/0001_outreach.sql", import.meta.url).pathname;
const NOW = new Date("2026-12-01T09:00:00Z");
const TOKEN = "t".repeat(40);

function addContact(raw: any, o: Partial<Record<string, any>> = {}) {
  const slug = o.tool_slug ?? "alpha.example.com";
  const c = { tool_slug: slug, tool_name: o.tool_name ?? "Alpha", tool_domain: slug, kind: o.kind ?? "ambiguous_live", contact_email: o.contact_email ?? `privacy@${slug}`, role: "privacy", contact_source_url: `https://${slug}/privacy`, policy_url: `https://${slug}/privacy`, policy_label: "Privacy Policy", question_text: "We reviewed your Privacy Policy. It does not say whether customer data is used to train AI models.", vetted_by: "test", vetted_at: "2026-11-10", status: o.status ?? "eligible", hand_sent_at: o.hand_sent_at ?? null, hand_sent_source: o.hand_sent_source ?? null };
  const r = raw.prepare(`INSERT INTO outreach_contacts (${Object.keys(c).join(",")}) VALUES (${Object.keys(c).map(() => "?").join(",")})`).run(...Object.values(c));
  return Number(r.lastInsertRowid);
}
function gate(raw: any, slug: string, passes: 0 | 1, reason = passes ? "pass: test" : "blocked: test", confirmed = 0) {
  raw.prepare("INSERT INTO card_gate (tool_slug, flagged, passes, gate_reason, card_confirmed, confirmed_by, confirmed_at, flag_source) VALUES (?, 1, ?, ?, ?, ?, ?, 'test')").run(slug, passes, reason, confirmed, confirmed ? "Elliot" : null, confirmed ? "2026-11-10" : null);
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
  it("defaults: D1 paused, cap 3, dry-run => nothing sent", async () => {
    addContact(db.raw); gate(db.raw, "alpha.example.com", 1);
    const EMAIL = sendMock();
    const r = await runDaily({ DB: db.d1, EMAIL } as any, NOW);
    expect(r.mode).toBe("dry_run");
    expect(r.rendered).toHaveLength(1);
    expect(r.rendered[0].card_gate).toBe("pass: test");
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
  it("cap: D1 value clamped to the hard max of 5; default 3", async () => {
    for (let i = 0; i < 8; i++) { const s = `t${i}.example`; addContact(db.raw, { tool_slug: s }); gate(db.raw, s, 1); }
    const env = live(db);
    expect((await runDaily(env, NOW)).sent).toHaveLength(3);
    db.raw.prepare("UPDATE outreach_settings SET value = '50' WHERE key = 'daily_cap'").run();
    expect((await planDay(db.d1, NOW)).cap).toBe(HARD_DAILY_MAX);
    expect((await runDaily(env, NOW)).sent).toHaveLength(2); // 3 + 2 = 5 today
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
    expect(await cardGate(db.d1, "alpha.example.com")).toEqual({ open: true, reason: "pass: card confirmed by Elliot" });
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
