import { describe, expect, it } from "vitest";
import { DOMAIN_MATCH_EXCEPTIONS, KNOWN_SHARED_DOMAINS, roleOf, toolKey, vetContact } from "../src/contacts";
import { readFileSync } from "node:fs";
import { applyContextEdit, buildLoad, CONTEXT_EDITS, parseCsv, parseHeldPack, parseRecheck, parseSteward, toSql } from "../src/loader";

const ok = (contactEmail: string, toolDomain = "example.com", contactSourceUrl = "https://example.com/privacy") => vetContact({ contactEmail, toolDomain, contactSourceUrl });

describe("gate 2: role addresses only, domain match", () => {
  it("accepts the allowed roles", () => {
    for (const [a, r] of [["privacy@example.com", "privacy"], ["dpo@example.com", "dpo"], ["legal@example.com", "legal"], ["compliance@example.com", "compliance"], ["dataprotection@example.com", "dataprotection"], ["data.protection@example.com", "dataprotection"], ["gdpr@example.com", "gdpr"], ["press@example.com", "press"], ["DataPrivacy@example.com", "privacy"], ["privacyinfo@example.com", "privacy"], ["privacy-team@example.com", "privacy"]] as const)
      expect(ok(a)).toMatchObject({ ok: true, role: r });
  });
  it("rejects non-role and personal-looking local parts", () => {
    for (const a of ["support@example.com", "hi@example.com", "security@example.com", "user_feedback@example.com", "jane.smith@example.com", "jsmith@example.com", "privacy.jane@example.com", "joseph@example.com", "us-data-requests@example.com"])
      expect(ok(a)).toMatchObject({ ok: false });
    expect(roleOf("jane")).toBeNull();
  });
  it("rejects webmail, form-only and malformed", () => {
    expect(ok("privacy@gmail.com", "gmail.com", "https://gmail.com/x")).toMatchObject({ ok: false, reason: "webmail" });
    expect(ok("form only: https://example.com/form")).toMatchObject({ ok: false, reason: "form_only" });
    expect(ok("privacy@@example.com")).toMatchObject({ ok: false });
  });
  it("recipient domain must equal the tool's or the source page's registrable domain", () => {
    expect(ok("privacy@example.org")).toMatchObject({ ok: false });
    expect(ok("privacy@example.net", "example.com", "https://legal.example.net/p")).toMatchObject({ ok: true });
    expect(ok("privacy@mail.example.com")).toMatchObject({ ok: true, recipientDomain: "example.com" });
    expect(ok("privacy@example.com", "example.com", "http://example.com/p")).toMatchObject({ ok: false, reason: "contact_source_not_https" });
  });
});

describe("gate 2: parent-company exceptions (Elliot 11:57 UK)", () => {
  const X = [{ toolDomain: "tool.example", contactEmail: "privacy@parent.example", contactSourceUrl: "https://tool.example/privacy", reason: "parent company: test", vettedBy: "dev" as const, vettedAt: "2026-11-10T11:57:00Z" }];
  const v = (email: string, src = "https://tool.example/privacy", tool = "tool.example") => vetContact({ contactEmail: email, toolDomain: tool, contactSourceUrl: src }, X);
  it("allows the exact address on the exact source page for that tool, and says why", () => {
    expect(v("privacy@parent.example")).toMatchObject({ ok: true, recipientDomain: "parent.example", domainMatchException: { reason: "parent company: test" } });
    expect(v("PRIVACY@parent.example")).toMatchObject({ ok: true });
  });
  it("refuses any other address, source page or tool on that domain", () => {
    expect(v("legal@parent.example")).toMatchObject({ ok: false });
    expect(v("privacy@parent.example", "https://tool.example/terms")).toMatchObject({ ok: false });
    expect(v("privacy@parent.example", "https://other.example/privacy", "other.example")).toMatchObject({ ok: false });
  });
  it("still needs a role address", () => {
    const Y = [{ ...X[0], contactEmail: "support@parent.example" }];
    expect(vetContact({ contactEmail: "support@parent.example", toolDomain: "tool.example", contactSourceUrl: "https://tool.example/privacy" }, Y)).toMatchObject({ ok: false, reason: "not_a_role_address" });
  });
  it("the shipped list is exactly the five Dev verified, all role addresses on https source pages", () => {
    expect(DOMAIN_MATCH_EXCEPTIONS.map((x) => `${x.toolDomain}>${x.contactEmail}`)).toEqual(["mailchimp.com>privacy@intuit.com", "windsurf.com>privacy@cognition.ai", "poe.com>privacy@quora.com", "replit.com>privacy@repl.it", "remove.bg>privacy@edpo.com"]);
    for (const x of DOMAIN_MATCH_EXCEPTIONS) {
      expect(roleOf(x.contactEmail.split("@")[0])).not.toBeNull();
      expect(x.contactSourceUrl.startsWith("https://")).toBe(true);
      expect(x).toMatchObject({ vettedBy: "dev" });
      expect(x.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("OpenRouter wording fix (11:57 UK)", () => {
  it("replaces only our own phrase, exactly once, and the result has no banned word", () => {
    const before = "Users can opt out. Neither page states whether that routing setting is on by default for paid or free models.";
    const after = applyContextEdit("OpenRouter", before);
    expect(after).toBe("Users can opt out. Neither page states whether that routing setting is on by default across all model tiers.");
    expect(after).not.toMatch(/\bpaid\b/i);
    expect(() => applyContextEdit("OpenRouter", "different text")).toThrow(/expected 1 match/);
    expect(applyContextEdit("Other", before)).toBe(before);
    expect(Object.keys(CONTEXT_EDITS)).toEqual(["openrouter"]);
  });
});

describe("gate 2 loader: dedupe, skips and card gate rows", () => {
  const md = "### 1. Alpha\n\n- **Policy reviewed:** Privacy Policy v1\n- **Contact source:** https://alpha.example.com/privacy\n\n**To:** `privacy@alpha.example.com`\n\n```\nHello,\n\nI run PolicyPeek.\n\nWe reviewed your Privacy Policy v1. It is silent.\n\nPlease could you confirm:\n1. a\n```\n";
  const tracker = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nAlpha,privacy@alpha.example.com,https://alpha.example.com/privacy,2026-11-10,drafted,,\nBeta,privacy@beta.example,https://beta.example/p,2026-11-10,sent,,\nGamma,privacy@gamma.example,https://gamma.example/p,2026-11-10,maybe,,\nDelta,support@delta.example,https://delta.example/p,2026-11-10,drafted,,\nEps,form only: https://eps.example/f,https://eps.example/p,2026-11-10,drafted,,\n");
  const live = [{ domain: "live1.example", name: "Live One", source_urls: '["https://live1.example/privacy"]' }, { domain: "live2.example", name: "Live Two", source_urls: '["https://live2.example/privacy"]', compliance_status: "unrated" }, { domain: "live3.example", name: "Live Three", source_urls: "[]", compliance_status: "compliant" }];
  const flags = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nLive One,privacy@live1.example,https://live1.example/privacy,2026-11-10,research,,\n");
  const recheckMd = "## Summary\n\n| # | Tool (slug) | Live verdict | Proposed | Email still needed? |\n|---|---|---|---|---|\n| 1 | Live One (live1.example) | Trains | **held** (may use) | Yes |\n\n### 1. Live One (live1.example)\n\n> we may use Content to train our models.\n\nSource: https://live1.example/terms — Updated 2026.\n";
  const recheck = parseRecheck(recheckMd);
  const stewardMd = "## Rulings\n1. **Live One** — not_compliant → held — **APPROVE.** x\n";
  const steward = parseSteward(stewardMd);
  it("counts and skips", () => {
    const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv: flags, recheck, steward, vettedBy: "t" });
    expect(r.counts.totalHeld).toBe(5);
    expect(r.counts.alreadySentByHand).toBe(0); // Beta has no context paragraph => skipped before counting
    expect(r.counts.unclear).toBe(1);
    expect(r.counts.missingContact).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(["tracker_status_unclear", "not_a_role_address", "form_only (hand route, never parsed; vet by hand)"]));
    const alpha = r.contacts.find((c) => c.tool_name === "Alpha")!;
    expect(alpha).toMatchObject({ status: "paused", paused_reason: "awaiting hand-sent list", question_text: "We reviewed your Privacy Policy v1. It is silent." });
    const lo = r.contacts.find((c) => c.tool_name === "Live One")!;
    // 11:57 UK: unclear tools are emailed automatically (no wording pause); held stay paused.
    expect(lo).toMatchObject({ kind: "ambiguous_live", status: "eligible", paused_reason: null, policy_url: "https://live1.example/terms" });
    expect(lo.question_text).toBe(`We reviewed https://live1.example/terms. It says: "we may use Content to train our models." We'd like to make sure we read this correctly.`);
    expect(r.cardGate.find((g) => g.tool_slug === "live1.example")).toMatchObject({ flagged: 1, passes: 1, gate_reason: "pass: steward ruling held (APPROVE)" });
    // MF7: an unflagged live card passes only with a held/unclear stored verdict.
    expect(r.cardGate.find((g) => g.tool_slug === "live2.example")).toMatchObject({ flagged: 0, passes: 1, basis: "unclear_live", live_verdict: "unrated" });
    expect(r.cardGate.find((g) => g.tool_slug === "live3.example")).toMatchObject({ flagged: 0, passes: 0, gate_reason: "blocked: unflagged live card with definite verdict compliant (MF7)" });
    expect(r.cardGate.find((g) => g.tool_slug === alpha.tool_slug)).toMatchObject({ passes: 1, gate_reason: "pass: held tool (held-outreach tracker)" });
    const sql = toSql(r, "t", "2026-11-10T00:00:00Z");
    // The loader never writes card_confirmed (only the admin action does).
    expect(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")).not.toMatch(/card_confirmed/);
  });
  it("hand-sent list (11:37 UK): zerodeposit.com and .co.uk become sent_by_hand and domain-suppressed", () => {
    const t = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nZero Deposit,compliance@zerodeposit.com,https://www.zerodeposit.com/p.pdf,2026-11-10,drafted,,\nZD UK,privacy@zerodeposit.co.uk,https://zerodeposit.co.uk/p,2026-11-10,drafted,,\n");
    const pack = new Map([["zero deposit", { toolName: "Zero Deposit", to: "", policyLabel: "v10.3", contactSource: "", context: "We reviewed it." }], ["zd uk", { toolName: "ZD UK", to: "", policyLabel: "x", contactSource: "", context: "We reviewed it." }]]);
    const r = buildLoad({ tracker: t, heldPack: pack, liveTools: [], flagCsv: null, recheck: null, steward: null, vettedBy: "t" });
    expect(r.contacts.map((c) => [c.status, c.hand_sent_at, c.hand_sent_source])).toEqual([["sent_by_hand", "2026-11-10", "Elliot, by hand"], ["sent_by_hand", "2026-11-10", "Elliot, by hand"]]);
    expect(r.counts.alreadySentByHand).toBe(2);
    const sql = toSql(r, "t", "now");
    expect(sql).toContain("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('domain', 'zerodeposit.com', 'manual');");
    expect(sql).toContain("'zerodeposit.co.uk', 'manual'");
  });
  it("card gate authority is the steward ruling (11:44 UK)", () => {
    const md = [
      "1. **Mailchimp** — not_compliant → held — **APPROVE.** a",
      "2. **Meshy** — not_compliant → compliant_with_caveats — **APPROVE.** b",
      "3. **Stability AI** — held (unchanged), source /ds-pp → /privacypolicy — **APPROVE.** c",
      "4. **Ahrefs** — not_compliant → held — **REJECT (keep not_compliant).** d",
      "5. **Microsoft Copilot** — company-wide → consumer held / M365 compliant — **APPROVE-WITH-EDIT.** e",
      "6. **v0** — company-wide (unchanged) — **APPROVE.** f",
    ].join("\n");
    const st = parseSteward(md);
    expect(Object.fromEntries([...st].map(([k, v]) => [k, v.held]))).toEqual({ mailchimp: true, meshy: false, "stability ai": true, ahrefs: false, "microsoft copilot": true, v0: false });
    const lt = [["mailchimp.com", "Mailchimp"], ["meshy.ai", "Meshy"], ["stability.ai", "Stability AI (DreamStudio)"], ["ahrefs.com", "Ahrefs"], ["vercel.com", "v0"], ["live5.example", "Live Five"]].map(([domain, name]) => ({ domain, name, source_urls: "[]" }));
    const f = parseCsv("tool\n" + lt.map((t) => t.name).join("\n") + "\n");
    const r = buildLoad({ tracker: [], heldPack: new Map(), liveTools: lt, flagCsv: f, recheck: null, steward: st, vettedBy: "t" });
    const g = (x: string) => r.cardGate.find((y) => y.tool_slug === x)!;
    // MF9: Elliot's "unclear" ruling supersedes the steward's "held"; no stored verdict here => blocked.
    expect(g("mailchimp.com")).toMatchObject({ passes: 0, gate_reason: expect.stringMatching(/owner ruling unclear but stored verdict unpublished/) });
    expect(g("stability.ai").passes).toBe(1);
    expect(g("meshy.ai")).toMatchObject({ passes: 0, gate_reason: "blocked: steward APPROVE compliant_with_caveats" });
    expect(g("ahrefs.com").gate_reason).toMatch(/^blocked: steward REJECT/);
    expect(g("vercel.com#v0").passes).toBe(0);
    expect(r.cardGate.find((y) => y.tool_slug === "vercel.com")).toBeUndefined();
    expect(g("live5.example")).toMatchObject({ passes: 0, gate_reason: "blocked: flagged in ambiguous-cards audit, no steward ruling" });
  });
  it("fail closed: missing steward file or missing CSV => every tool blocked, held included", () => {
    for (const [flagCsv, sw] of [[null, steward], [flags, null]] as const) {
      const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv, recheck, steward: sw, vettedBy: "t" });
      expect(r.cardGate.length).toBeGreaterThan(0);
      expect(r.cardGate.every((x) => x.passes === 0 && /fail closed/.test(x.gate_reason))).toBe(true);
    }
  });
});

describe("MF8: card gate keyed per tool, never per shared domain", () => {
  it("shared list matches backend/src/sharedDomains.ts exactly", () => {
    const be = readFileSync(new URL("../../../backend/src/sharedDomains.ts", import.meta.url), "utf8");
    const list = [...be.slice(be.indexOf("KNOWN_SHARED_DOMAINS"), be.indexOf("]);")).matchAll(/"([a-z0-9.-]+)"/g)].map((m) => m[1]);
    expect([...KNOWN_SHARED_DOMAINS].sort()).toEqual(list.sort());
  });
  it("google/microsoft/amazon/vercel tools each get their own key; single-tool domains keep the domain", () => {
    expect(toolKey("google.com", "Gemini")).toBe("google.com#gemini");
    expect(toolKey("microsoft.com", "Microsoft Copilot")).toBe("microsoft.com#microsoft-copilot");
    expect(toolKey("amazon.com", "Amazon Q Developer")).toBe("amazon.com#amazon-q-developer");
    expect(toolKey("vercel.com", "v0")).toBe("vercel.com#v0");
    expect(toolKey("buffer.com", "Buffer")).toBe("buffer.com");
    expect(toolKey("two.example", "A", ["two.example"])).toBe("two.example#a");
  });
  it("loader: a ruling for one product on a shared domain never covers another product there", () => {
    const lt = [["google.com", "Gemini"], ["google.com", "NotebookLM"], ["amazon.com", "Amazon Q Developer"], ["two.example", "Tool A"], ["two.example", "Tool B"]].map(([domain, name]) => ({ domain, name, source_urls: "[]" }));
    const st = parseSteward("1. **Gemini** — company-wide → consumer held — **APPROVE.** x\n2. **Tool A** — x → held — **APPROVE.** y\n");
    const f = parseCsv("tool\n" + lt.map((t) => t.name).join("\n") + "\n");
    const r = buildLoad({ tracker: [], heldPack: new Map(), liveTools: lt, flagCsv: f, recheck: null, steward: st, vettedBy: "t" });
    const g = Object.fromEntries(r.cardGate.map((x) => [x.tool_slug, x.passes]));
    expect(g).toEqual({ "google.com#gemini": 1, "google.com#notebooklm": 0, "amazon.com#amazon-q-developer": 0, "two.example#tool-a": 1, "two.example#tool-b": 0 });
  });
});

describe("MF9: Mailchimp follows its stored verdict, not the static steward file", () => {
  const st = parseSteward("1. **Mailchimp** — not_compliant → held — **APPROVE.** a\n");
  const f = parseCsv("tool\nMailchimp\n");
  const load = (v: string) => buildLoad({ tracker: [], heldPack: new Map(), liveTools: [{ domain: "mailchimp.com", name: "Mailchimp", source_urls: "[]", compliance_status: v }], flagCsv: f, recheck: null, steward: st, vettedBy: "t", verdictAsOf: "2026-11-10T12:00:00Z" }).cardGate[0];
  it("stored not_compliant (export before PR #47) => blocked, despite the steward 'held'", () => {
    expect(load("not_compliant")).toMatchObject({ passes: 0, basis: "blocked" });
  });
  it("stored unrated (PR #47 live) => unclear_live, which the sender re-checks against the mirror", () => {
    expect(load("unrated")).toMatchObject({ passes: 1, basis: "unclear_live", verdict_at_load: "unrated", live_verdict: "unrated", verdict_as_of: "2026-11-10T12:00:00Z" });
  });
  it("verdict refresh SQL touches only the mirror columns; reviewed-unpublished tools become 'unpublished', never NULL", async () => {
    const { verdictRefreshSql } = await import("../src/loader");
    const gate = [{ tool_slug: "mailchimp.com", verdict_at_load: "not_compliant" }, { tool_slug: "gone.example", verdict_at_load: "unpublished" }, { tool_slug: "vercel.com#v0", verdict_at_load: "shared_domain_unverified" }];
    const sql = verdictRefreshSql(gate, [{ domain: "mailchimp.com", name: "Mailchimp", source_urls: "[]", compliance_status: "unrated" }, { domain: "vercel.com", name: "v0", source_urls: "[]", compliance_status: "shared_domain_unverified" }], "2026-11-11T08:00:00Z", { minRows: 2, now: new Date("2026-11-11T08:05:00Z") });
    expect(sql).toContain("UPDATE card_gate SET live_verdict = 'unrated', verdict_as_of = '2026-11-11T08:00:00.000Z' WHERE tool_slug = 'mailchimp.com';");
    expect(sql).toContain("live_verdict = 'unpublished', verdict_as_of = '2026-11-11T08:00:00.000Z' WHERE tool_slug = 'gone.example'");
    expect(sql).toContain("live_verdict = 'shared_domain_unverified', verdict_as_of = '2026-11-11T08:00:00.000Z' WHERE tool_slug = 'vercel.com#v0'");
    expect(sql).not.toMatch(/NULL|passes|basis|verdict_at_load|card_confirmed/);
  });
});

describe("MF10: hand-sent check applies to any tool on the held tracker", () => {
  it("Mailchimp (form-only on the tracker) loads PAUSED with on_held_tracker=1 even as an ambiguous_live row", () => {
    const tracker = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nMailchimp,form only: https://mailchimp.com/privacy-rights/,https://mailchimp.com/privacy-rights/,2026-11-10,drafted,2026-11-24,\n");
    const live = [{ domain: "mailchimp.com", name: "Mailchimp", source_urls: '["https://mailchimp.com/legal/terms/"]', compliance_status: "unrated" }, { domain: "buffer.com", name: "Buffer", source_urls: "[]", compliance_status: "unrated" }];
    const flags = parseCsv("tool,contact,contact_source_url\nMailchimp,privacy@intuit.com,https://mailchimp.com/about/privacy-rights/\nBuffer,privacy@buffer.com,https://buffer.com/legal\n");
    const rc = parseRecheck("| 1 | Mailchimp (mailchimp.com) | x | y | Yes |\n| 2 | Buffer (buffer.com) | x | y | Yes |\n### 1. Mailchimp (mailchimp.com)\n> We may use Inputs.\nSource: https://mailchimp.com/legal/terms/ — x\n### 2. Buffer (buffer.com)\n> We may use data.\nSource: https://buffer.com/legal — x\n");
    const r = buildLoad({ tracker, heldPack: new Map(), liveTools: live, flagCsv: flags, recheck: rc, steward: parseSteward(""), vettedBy: "t", verdictAsOf: "2026-11-10T12:00:00Z" });
    const mc = r.contacts.find((c) => c.tool_slug === "mailchimp.com")!;
    expect(mc).toMatchObject({ kind: "ambiguous_live", on_held_tracker: 1, status: "paused", paused_reason: "on held tracker: awaiting hand-sent list" });
    expect(r.contacts.find((c) => c.tool_slug === "buffer.com")).toMatchObject({ on_held_tracker: 0 });
    expect(toSql(r, "t", "now")).toMatch(/'mailchimp\.com', 'Mailchimp', 'mailchimp\.com', 'ambiguous_live', 'privacy@intuit\.com'.*, 1, 'paused', 'on held tracker: awaiting hand-sent list'/);
  });
});

describe("SF6 + step (c): blocked tools load paused; the generated SQL has no eligible row", () => {
  const live = [["ahrefs.com", "Ahrefs", "not_compliant"], ["buffer.com", "Buffer", "unrated"]].map(([domain, name, compliance_status]) => ({ domain, name, source_urls: "[]", compliance_status }));
  const flags = parseCsv("tool,contact,contact_source_url\nAhrefs,privacy@ahrefs.com,https://ahrefs.com/legal/privacy-policy\nBuffer,privacy@buffer.com,https://buffer.com/legal\n");
  const rc = parseRecheck("| 1 | Ahrefs (ahrefs.com) | x | y | Yes |\n| 2 | Buffer (buffer.com) | x | y | Yes |\n### 1. Ahrefs (ahrefs.com)\n> q1\nSource: https://ahrefs.com/legal/privacy-policy — x\n### 2. Buffer (buffer.com)\n> q2\nSource: https://buffer.com/legal — x\n");
  const st = parseSteward("1. **Ahrefs** — not_compliant → held — **REJECT (keep).** a\n2. **Buffer** — held (unchanged) — **APPROVE.** b\n");
  const r = buildLoad({ tracker: [], heldPack: new Map(), liveTools: live, flagCsv: flags, recheck: rc, steward: st, vettedBy: "t", verdictAsOf: "2026-11-10T12:00:00Z" });
  it("definite-verdict (gate-blocked) tool => paused 'definite verdict: needs card_confirmed'; steward-held stays eligible in the plan", () => {
    expect(r.contacts.find((c) => c.tool_slug === "ahrefs.com")).toMatchObject({ status: "paused", paused_reason: "definite verdict: needs card_confirmed" });
    expect(r.contacts.find((c) => c.tool_slug === "buffer.com")).toMatchObject({ status: "eligible" });
  });
  it("toSql default writes every contact paused or sent_by_hand, never card_confirmed", async () => {
    const sql = toSql(r, "t", "now");
    const { makeDb } = await import("../../test-utils/d1shim");
    const db = makeDb(new URL("../migrations/0001_outreach.sql", import.meta.url).pathname);
    db.raw.exec(sql);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM outreach_contacts WHERE status NOT IN ('paused','sent_by_hand')").get().n).toBe(0);
    expect(db.raw.prepare("SELECT COUNT(*) n FROM card_gate WHERE card_confirmed = 1").get().n).toBe(0);
    expect(db.raw.prepare("SELECT paused_reason FROM outreach_contacts WHERE tool_slug = 'buffer.com'").get().paused_reason).toMatch(/^initial load: paused/);
  });
});

describe("MF11: verdict refresh fails closed", () => {
  const T = new Date("2026-11-11T07:30:00Z");
  const cat = (n: number) => Array.from({ length: n }, (_, i) => ({ domain: `t${i}.example`, name: `T${i}`, source_urls: "[]", compliance_status: "compliant" as string | null }));
  const gate = [{ tool_slug: "t0.example", verdict_at_load: "compliant" }, { tool_slug: "held.example", verdict_at_load: "unpublished" }];
  let mod: typeof import("../src/loader");
  it("loads", async () => { mod = await import("../src/loader"); expect(mod.MIN_CATALOG_TOOLS).toBe(66); });
  it("refuses a short export (fewer than the known catalog size 66, or fewer than the previous count)", () => {
    expect(() => mod.verdictRefreshSql(gate, cat(65), "2026-11-11T07:00:00Z", { now: T })).toThrow(/expected at least 66/);
    expect(() => mod.verdictRefreshSql(gate, cat(66), "2026-11-11T07:00:00Z", { now: T })).not.toThrow();
    expect(() => mod.verdictRefreshSql(gate, cat(70), "2026-11-11T07:00:00Z", { now: T, previousCount: 71 })).toThrow(/expected at least 71/);
    expect(() => mod.verdictRefreshSql(gate, [], "2026-11-11T07:00:00Z", { now: T })).toThrow();
  });
  it("refuses an export missing any tool the gate knew as published (even if long enough)", () => {
    const c = cat(70).filter((t) => t.domain !== "t0.example");
    expect(() => mod.verdictRefreshSql(gate, c, "2026-11-11T07:00:00Z", { now: T })).toThrow(/missing known tool t0\.example/);
    // a gate row with a NULL verdict_at_load (unknown) missing from the export also refuses
    expect(() => mod.verdictRefreshSql([{ tool_slug: "x.example", verdict_at_load: null }], cat(70), "2026-11-11T07:00:00Z", { now: T })).toThrow(/missing known tool x\.example/);
  });
  it("refuses empty/unknown verdicts, rows without domain/name, and duplicate keys", () => {
    for (const bad of [null, "", "trains", " compliant"]) {
      const c = cat(70); c[3].compliance_status = bad;
      expect(() => mod.verdictRefreshSql(gate, c, "2026-11-11T07:00:00Z", { now: T })).toThrow(/missing\/unknown verdict/);
    }
    const c2 = cat(70); (c2[4] as any).domain = "";
    expect(() => mod.verdictRefreshSql(gate, c2, "2026-11-11T07:00:00Z", { now: T })).toThrow(/missing domain or name/);
    const c3 = [...cat(70), { domain: "t1.example", name: "T1", source_urls: "[]", compliance_status: "compliant" }];
    expect(() => mod.verdictRefreshSql(gate, c3, "2026-11-11T07:00:00Z", { now: T })).toThrow(/duplicate/);
  });
  it("requires an explicit PROD_TOOLS_AS_OF: no mtime fallback, ISO with zone, not in the future", () => {
    for (const bad of [undefined, "", "  ", "yesterday", "2026-11-11 07:00", "2026-11-11T07:00:00", "2026-11-11T09:00:00Z"])
      expect(() => mod.requireAsOf(bad as any, T)).toThrow(mod.ExportError);
    expect(mod.requireAsOf("2026-11-11T07:00:00Z", T)).toBe("2026-11-11T07:00:00.000Z");
    expect(() => mod.verdictRefreshSql(gate, cat(70), "", { now: T })).toThrow(/PROD_TOOLS_AS_OF is required/);
  });
  it("the scripts read no file time and require PROD_TOOLS_AS_OF", () => {
    for (const f of ["build-verdicts-sql.ts", "build-contacts-sql.ts", "refresh-verdicts.ts"]) {
      const src = readFileSync(new URL(`../scripts/${f}`, import.meta.url), "utf8");
      expect(src).not.toMatch(/mtime|statSync/);
      expect(src).toMatch(/requireAsOf\(process\.env\.PROD_TOOLS_AS_OF/);
    }
  });
  it("loader writes 'unpublished' for tools absent from the catalog and never passes an empty live verdict", () => {
    const tr = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nHeldOne,privacy@heldone.example,https://heldone.example/p,2026-11-10,drafted,,\nPub,privacy@pub.example,https://pub.example/p,2026-11-10,drafted,,\n");
    const pack = new Map([["heldone", { toolName: "HeldOne", to: "", policyLabel: "p", contactSource: "", context: "We reviewed it." }], ["pub", { toolName: "Pub", to: "", policyLabel: "p", contactSource: "", context: "We reviewed it." }]]);
    const r = buildLoad({ tracker: tr, heldPack: pack, liveTools: [{ domain: "pub.example", name: "Pub", source_urls: "[]", compliance_status: "" }], flagCsv: parseCsv("tool\n"), recheck: null, steward: parseSteward(""), vettedBy: "t", verdictAsOf: "2026-11-10T12:00:00Z" });
    expect(r.cardGate.find((g) => g.tool_slug === "heldone.example")).toMatchObject({ passes: 1, basis: "held_tracker", verdict_at_load: "unpublished", live_verdict: "unpublished" });
    expect(r.cardGate.find((g) => g.tool_slug === "pub.example")).toMatchObject({ passes: 0, verdict_at_load: null });
  });
});

describe("daily verdict refresh job (Jump: automatic, fail closed; not scheduled)", () => {
  const src = readFileSync(new URL("../scripts/refresh-verdicts.ts", import.meta.url), "utf8");
  it("policypeek-db is only ever read with a fixed SELECT via --command, never --file", () => {
    expect(src).toMatch(/export const EXPORT_SQL = "SELECT domain, name, compliance_status, source_urls FROM tools ORDER BY domain, name";/);
    const exportCmd = src.split("\n").find((l) => l.startsWith("const EXPORT_CMD"))!;
    expect(exportCmd).toMatch(/"policypeek-db", "--remote", "--json", "--command", EXPORT_SQL/);
    expect(exportCmd).not.toMatch(/--file/);
    expect(src.split("\n").filter((l) => /policypeek-db/.test(l) && !/^\s*\/\//.test(l))).toEqual([exportCmd]); // only the export command touches it
  });
  it("writes only to policypeek-outreach, only with --apply, and only after verdictRefreshSql validated the export", () => {
    expect(src).toMatch(/const applyCmd = \(file: string\) => \[\.\.\.W, "d1", "execute", "policypeek-outreach", \.\.\.OUTREACH, "--file", file\]/);
    expect(src.indexOf("verdictRefreshSql(gate, tools, asOf, { previousCount })")).toBeLessThan(src.indexOf("npx(applyCmd(file), workers)"));
    expect(src).toMatch(/!args\.includes\("--apply"\)/);
    expect(src).toMatch(/process\.exit\(1\)/);
  });
});
