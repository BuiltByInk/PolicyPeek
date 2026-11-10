import { describe, expect, it } from "vitest";
import { roleOf, vetContact } from "../src/contacts";
import { buildLoad, parseCsv, parseHeldPack, parseRecheck, toSql } from "../src/loader";

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

describe("gate 2 loader: dedupe, skips and card gate rows", () => {
  const md = "### 1. Alpha\n\n- **Policy reviewed:** Privacy Policy v1\n- **Contact source:** https://alpha.example.com/privacy\n\n**To:** `privacy@alpha.example.com`\n\n```\nHello,\n\nI run PolicyPeek.\n\nWe reviewed your Privacy Policy v1. It is silent.\n\nPlease could you confirm:\n1. a\n```\n";
  const tracker = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nAlpha,privacy@alpha.example.com,https://alpha.example.com/privacy,2026-11-10,drafted,,\nBeta,privacy@beta.example,https://beta.example/p,2026-11-10,sent,,\nGamma,privacy@gamma.example,https://gamma.example/p,2026-11-10,maybe,,\nDelta,support@delta.example,https://delta.example/p,2026-11-10,drafted,,\nEps,form only: https://eps.example/f,https://eps.example/p,2026-11-10,drafted,,\n");
  const live = [{ domain: "live1.example", name: "Live One", source_urls: '["https://live1.example/privacy"]' }, { domain: "live2.example", name: "Live Two", source_urls: '["https://live2.example/privacy"]' }];
  const flags = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nLive One,privacy@live1.example,https://live1.example/privacy,2026-11-10,research,,\n");
  const recheckMd = "## Summary\n\n| # | Tool (slug) | Live verdict | Proposed | Email still needed? |\n|---|---|---|---|---|\n| 1 | Live One (live1.example) | Trains | **held** (may use) | Yes |\n\n### 1. Live One (live1.example)\n\n> we may use Content to train our models.\n\nSource: https://live1.example/terms — Updated 2026.\n";
  const recheck = parseRecheck(recheckMd);
  it("counts and skips", () => {
    const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv: flags, recheck, vettedBy: "t" });
    expect(r.counts.totalHeld).toBe(5);
    expect(r.counts.alreadySentByHand).toBe(0); // Beta has no context paragraph => skipped before counting
    expect(r.counts.unclear).toBe(1);
    expect(r.counts.missingContact).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(["tracker_status_unclear", "not_a_role_address", "form_only (hand route, never parsed)"]));
    const alpha = r.contacts.find((c) => c.tool_name === "Alpha")!;
    expect(alpha).toMatchObject({ status: "paused", paused_reason: "awaiting hand-sent list", question_text: "We reviewed your Privacy Policy v1. It is silent." });
    const lo = r.contacts.find((c) => c.tool_name === "Live One")!;
    expect(lo).toMatchObject({ kind: "ambiguous_live", status: "paused", policy_url: "https://live1.example/terms" });
    expect(lo.question_text).toBe(`We reviewed https://live1.example/terms. It says: "we may use Content to train our models." We'd like to make sure we read this correctly.`);
    expect(r.cardGate.find((g) => g.tool_slug === "live1.example")).toMatchObject({ flagged: 1, passes: 1, gate_reason: "pass: recheck-2026-11-10 proposes held" });
    expect(r.cardGate.find((g) => g.tool_slug === "live2.example")).toMatchObject({ flagged: 0, passes: 1 });
    expect(r.cardGate.find((g) => g.tool_slug === alpha.tool_slug)).toMatchObject({ passes: 1, gate_reason: "pass: held tool (held-outreach tracker)" });
    const sql = toSql(r, "t", "2026-11-10T00:00:00Z");
    // The loader never writes card_confirmed (only the admin action does).
    expect(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")).not.toMatch(/card_confirmed/);
  });
  it("hand-sent list (11:37 UK): zerodeposit.com and .co.uk become sent_by_hand and domain-suppressed", () => {
    const t = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nZero Deposit,compliance@zerodeposit.com,https://www.zerodeposit.com/p.pdf,2026-11-10,drafted,,\nZD UK,privacy@zerodeposit.co.uk,https://zerodeposit.co.uk/p,2026-11-10,drafted,,\n");
    const pack = new Map([["zero deposit", { toolName: "Zero Deposit", to: "", policyLabel: "v10.3", contactSource: "", context: "We reviewed it." }], ["zd uk", { toolName: "ZD UK", to: "", policyLabel: "x", contactSource: "", context: "We reviewed it." }]]);
    const r = buildLoad({ tracker: t, heldPack: pack, liveTools: [], flagCsv: null, recheck: null, vettedBy: "t" });
    expect(r.contacts.map((c) => [c.status, c.hand_sent_at, c.hand_sent_source])).toEqual([["sent_by_hand", "2026-11-10", "Elliot, by hand"], ["sent_by_hand", "2026-11-10", "Elliot, by hand"]]);
    expect(r.counts.alreadySentByHand).toBe(2);
    const sql = toSql(r, "t", "now");
    expect(sql).toContain("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('domain', 'zerodeposit.com', 'manual');");
    expect(sql).toContain("'zerodeposit.co.uk', 'manual'");
  });
  it("card gate rule (11:39 UK): no-email-needed and definite non-held changes block; flagged without proposal blocks", () => {
    const live3 = [...live, { domain: "live3.example", name: "Live Three", source_urls: '["https://live3.example/p"]' }, { domain: "live4.example", name: "Live Four", source_urls: '["https://live4.example/p"]' }, { domain: "live5.example", name: "Live Five", source_urls: '["https://live5.example/p"]' }];
    const f = parseCsv("tool,contact,contact_source_url,date_drafted,status,follow_up_due,reply\nLive One,a,b,c,d,,\nLive Three,a,b,c,d,,\nLive Four,a,b,c,d,,\nLive Five,a,b,c,d,,\n");
    const rc = parseRecheck(recheckMd + "| 2 | Live Three (live3.example) | x | **compliant_with_caveats** (ok) | No — terms are sufficient |\n| 3 | Live Four (live4.example) | x | **compliant** for UK | Yes |\n");
    const r = buildLoad({ tracker: [], heldPack: new Map(), liveTools: live3, flagCsv: f, recheck: rc, vettedBy: "t" });
    const g = (s: string) => r.cardGate.find((x) => x.tool_slug === s)!;
    expect(g("live3.example")).toMatchObject({ passes: 0 });
    expect(g("live3.example").gate_reason).toMatch(/no email needed/);
    expect(g("live4.example")).toMatchObject({ passes: 0 });
    expect(g("live4.example").gate_reason).toMatch(/definite change/);
    expect(g("live5.example")).toMatchObject({ passes: 0, gate_reason: "blocked: flagged in ambiguous-cards audit, no re-check proposal yet" });
  });
  it("fail closed: missing recheck file or missing CSV => every tool blocked, held included", () => {
    for (const [flagCsv, rc] of [[null, recheck], [flags, null]] as const) {
      const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv, recheck: rc, vettedBy: "t" });
      expect(r.cardGate.length).toBeGreaterThan(0);
      expect(r.cardGate.every((x) => x.passes === 0 && /fail closed/.test(x.gate_reason))).toBe(true);
    }
  });
});
