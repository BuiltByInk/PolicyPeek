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
  const live = [{ domain: "live1.example", name: "Live One", source_urls: '["https://live1.example/privacy"]' }, { domain: "live2.example", name: "Live Two", source_urls: '["https://live2.example/privacy"]' }];
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
    expect(r.cardGate.find((g) => g.tool_slug === "live2.example")).toMatchObject({ flagged: 0, passes: 1 });
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
    expect(g("mailchimp.com").passes).toBe(1);
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
