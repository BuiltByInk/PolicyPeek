import { describe, expect, it } from "vitest";
import { roleOf, vetContact } from "../src/contacts";
import { buildLoad, parseCsv, parseHeldPack, toSql } from "../src/loader";

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
  it("counts and skips", () => {
    const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv: flags, vettedBy: "t" });
    expect(r.counts.totalHeld).toBe(5);
    expect(r.counts.alreadySentByHand).toBe(0); // Beta has no context paragraph => skipped before counting
    expect(r.counts.unclear).toBe(1);
    expect(r.counts.missingContact).toBe(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining(["tracker_status_unclear", "not_a_role_address", "form_only (hand route, never parsed)"]));
    const alpha = r.contacts.find((c) => c.tool_name === "Alpha")!;
    expect(alpha).toMatchObject({ status: "eligible", question_text: "We reviewed your Privacy Policy v1. It is silent." });
    expect(r.contacts.find((c) => c.tool_name === "Live One")).toMatchObject({ kind: "ambiguous_live", status: "paused" });
    expect(r.cardGate.find((g) => g.tool_slug === "live1.example")!.flagged).toBe(1);
    expect(r.cardGate.find((g) => g.tool_slug === "live2.example")!.flagged).toBe(0);
    expect(r.cardGate.find((g) => g.tool_slug === alpha.tool_slug)!.flagged).toBe(1); // not in audit => fail closed
    const sql = toSql(r, "t", "2026-11-10T00:00:00Z");
    // The loader never writes card_confirmed (only the admin action does).
    expect(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")).not.toMatch(/card_confirmed/);
  });
  it("missing flag file => no flagged=0 rows at all", () => {
    const r = buildLoad({ tracker, heldPack: parseHeldPack(md), liveTools: live, flagCsv: null, vettedBy: "t" });
    expect(r.cardGate.every((g) => g.flagged === 1)).toBe(true);
  });
});
