import { describe, it, expect } from "vitest";
import {
  buildHeldItems, renderDigest, renderHeldAlert, renderItemText, summarise, toolPageUrl, safeUrlText, escapeHtml,
  ukTime, addDays, hostOf, FOLLOWUP_AFTER_DAYS, SNIPPET_MAX, type HeldRow, type ToolRow, type OutreachData,
} from "./heldDetail";

const facts = (f: Partial<{ trains_on_user_data: boolean | null; opt_out_available: boolean | null; relevant_clauses: string[] }>) =>
  JSON.stringify({ trains_on_user_data: null, data_retention: null, gdpr_mentioned: true, opt_out_available: null, relevant_clauses: [], ...f });

function row(p: Partial<HeldRow> & { id: number; domain: string }): HeldRow {
  return {
    name: null, is_recheck: 1, source_url: `https://${p.domain}/privacy`, archived_source_url: null, sourced_from_archive: 0,
    shared_domain: 0, extracted_facts: facts({}), extraction_error: null, created_at: "2026-11-18T04:00:30.000Z",
    updated_at: "2026-11-18T04:01:00.000Z", raw_fetch: "same text", ...p,
  };
}
const tool = (p: Partial<ToolRow> & { domain: string }): ToolRow => ({ name: p.domain, compliance_status: "unrated", manual_override: 0, last_checked_at: "2026-09-03T10:43:26.000Z", ...p });

describe("helpers", () => {
  it("builds the tool page with a trailing slash and refuses odd domains", () => {
    expect(toolPageUrl("Granola.ai")).toBe("https://getpolicypeek.com/tools/granola.ai/");
    expect(toolPageUrl("evil.com/../x")).toBeNull();
    expect(toolPageUrl("a b.com")).toBeNull();
  });
  it("keeps only http(s) URLs, cleaned and capped", () => {
    expect(safeUrlText("javascript:alert(1)")).toBeNull();
    expect(safeUrlText(null)).toBeNull();
    expect(safeUrlText("https://x.com/" + "a".repeat(500))!.length).toBeLessThanOrEqual(300);
    expect(safeUrlText("https://x.com/\u202epath")).not.toMatch(/\u202e/);
  });
  it("parses the hostname in punycode form", () => {
    expect(hostOf("https://www.Granola.ai/privacy")).toBe("www.granola.ai");
    expect(hostOf("https://bücher.example/p")).toBe("xn--bcher-kva.example");
    expect(hostOf("https://аррӏе.com/privacy")).toMatch(/^xn--/);
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
  it("escapes HTML and formats UK time", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(ukTime("2026-11-18T04:01:00.000Z")).toBe("18 Nov 2026, 04:01 UK time");
    expect(ukTime("2026-07-01T08:00:00.000Z")).toBe("1 Jul 2026, 09:00 UK time");
    expect(ukTime(null)).toBe("not recorded");
    expect(ukTime("2026-11-10")).toBe("10 Nov 2026");
    expect(addDays("2026-11-10", FOLLOWUP_AFTER_DAYS)).toBe("2026-11-24");
  });
});

describe("buildHeldItems grouping", () => {
  const outreach: OutreachData = {
    contacts: [
      { id: 1, tool_domain: "zerodeposit.com", contact_email: "compliance@zerodeposit.com", status: "sent_by_hand", paused_reason: null, hand_sent_at: "2026-11-10", resolved_at: null },
      { id: 2, tool_domain: "asana.com", tool_name: "Asana", policy_url: "https://asana.com/privacy", contact_email: "privacy@asana.com", status: "eligible", paused_reason: null, hand_sent_at: null, resolved_at: null },
      { id: 3, tool_domain: "copy.ai", contact_email: "legal@copy.ai", status: "paused", paused_reason: "awaiting hand-sent list", hand_sent_at: null, resolved_at: null },
    ],
    sends: [{ contact_id: 2, kind: "initial", status: "sent", sent_at: "2026-11-18T09:00:40.000Z" }],
    replies: [
      { matched_contact_id: 2, from_domain: "asana.com", received_at: "2026-11-18T09:01:00.000Z", classification: "reply" },
      { matched_contact_id: 2, from_domain: "asana.com", received_at: "2026-11-18T09:00:59.000Z", classification: "auto_reply" },
    ],
  };
  const rows: HeldRow[] = [
    row({ id: 1, domain: "copy.ai", created_at: "2026-11-11T04:00:00.000Z" }),
    row({ id: 2, domain: "copy.ai", created_at: "2026-11-15T04:00:00.000Z" }),
    row({ id: 3, domain: "hanco.com", extracted_facts: facts({ trains_on_user_data: false, relevant_clauses: ["We never train."] }) }),
    row({ id: 4, domain: "zerodeposit.com", is_recheck: 0, created_at: "2026-11-10T07:41:00.000Z", updated_at: "2026-11-10T07:41:00.000Z" }),
    row({ id: 5, domain: "krea.ai", is_recheck: 0 }),
    row({ id: 6, domain: "claude.com", extracted_facts: facts({ trains_on_user_data: true, opt_out_available: true }), extraction_error: "queued_for_review: the policy text came from a different domain after a redirect (www.anthropic.com) -- never auto-published" }),
    row({ id: 7, domain: "github.com", created_at: "2026-10-19T04:00:00.000Z" }),
    row({ id: 8, domain: "runway.com", extracted_facts: facts({}) }),
  ];
  const tools = [
    tool({ domain: "copy.ai", name: "Copy.ai" }),
    tool({ domain: "hanco.com", compliance_status: "not_ai_tool" }),
    tool({ domain: "claude.com", name: "Claude", compliance_status: "compliant_with_caveats", manual_override: 1 }),
    tool({ domain: "github.com", compliance_status: "compliant_with_caveats", manual_override: 1, last_checked_at: "2026-10-24T16:00:00.000Z" }),
    tool({ domain: "runway.com", name: "Runway", compliance_status: "not_compliant", manual_override: 1 }),
  ];
  const items = buildHeldItems(rows, tools, outreach);
  const by = (id: number) => items.find((i) => i.check_id === id)!;

  it("folds older checks of the same tool and marks unchanged repeats as noise", () => {
    expect(by(1)).toMatchObject({ group: "none", noise: "older_duplicate" });
    expect(by(2)).toMatchObject({ group: "none", noise: "unchanged_repeat", duplicates: 1 });
  });
  it("flags a verdict flip, including on a hand-checked entry", () => {
    expect(by(3)).toMatchObject({ group: "badge_change", current_verdict: "not_ai_tool", proposed_verdict: "compliant" });
    expect(by(8).group).toBe("badge_change");
    expect(by(8).action).toContain("Usually reject it");
  });
  it("treats a waiting clarification as no action, with follow-up due sent + 14 days", () => {
    expect(by(4)).toMatchObject({ group: "none", noise: "awaiting_reply" });
    expect(by(4).clarification).toMatchObject({ sent_at: "2026-11-10", followup_due: "2026-11-24", reply: null });
    expect(by(4).action).toContain("24 Nov 2026");
  });
  it("puts a new domain with no clarification into new_tool", () => {
    expect(by(5)).toMatchObject({ group: "new_tool", page_url: null, current_verdict: null, proposed_verdict: "unrated" });
  });
  it("puts a source moved to another host into policy_changed", () => {
    expect(by(6).group).toBe("policy_changed");
    expect(by(6).why_held).toContain("www.anthropic.com");
    expect(by(6).why_held).not.toContain("--");
  });
  it("marks a check the published entry was confirmed after as noise", () => {
    expect(by(7)).toMatchObject({ group: "none", noise: "already_confirmed" });
  });
  it("lists a clarification reply for a tool with no check in the queue, ignoring auto-replies", () => {
    const asana = items.find((i) => i.domain === "asana.com")!;
    expect(asana).toMatchObject({ group: "reply", check_id: 0 });
    expect(asana.clarification).toMatchObject({ followup_due: null, reply: { classification: "reply" } });
    expect(asana.action).toContain("Read the reply from asana.com");
  });
  it("summarises needs-you vs noise", () => {
    const s = summarise(items);
    expect(s.total).toBe(9);
    expect(s.needs_you).toBe(5);
    expect(s.by_group.none).toBe(4);
  });

  it("renders the digest grouped, top groups first, noise collapsed to one line", () => {
    const d = renderDigest(items, true)!;
    expect(d.subject).toBe("PolicyPeek: 5 items need you");
    const order = ["Clarification reply received", "Approve or reject a badge change", "New tool waiting", "Policy source or text changed"].map((t) => d.text.indexOf(t));
    expect(order.every((x) => x > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(d.text).toContain("needing nothing from you: 4");
    expect(d.text).not.toContain("check #1 ");
    expect(d.text).not.toMatch(/InkLLM|upgrade|premium|paid|pricing/i);
  });

  it("returns null (no email) when nothing needs Elliot", () => {
    expect(renderDigest(items.filter((i) => i.group === "none"), true)).toBeNull();
    expect(renderDigest([], true)).toBeNull();
  });
});

describe("rendering safety and missing fields", () => {
  it("escapes the quote in HTML, caps it, and never links the policy URL", () => {
    const evil = `<script>alert(1)</script>${"x".repeat(600)}`;
    const [it] = buildHeldItems(
      [row({ id: 9, domain: "evil.com", is_recheck: 0, source_url: "https://evil.com/p\"><a href=x>", extracted_facts: facts({ relevant_clauses: [evil] }) })],
      [], null
    );
    expect(it.snippet!.length).toBeLessThanOrEqual(SNIPPET_MAX);
    const a = renderHeldAlert(it, false);
    expect(a.html).not.toContain("<script>");
    expect(a.html).toContain("&lt;script&gt;");
    expect(a.html).not.toContain('href="https://evil.com');
    expect(a.html).not.toContain("<a href=x>");
    expect(a.text).toContain("Clarification email: not available (outreach data not connected)");
  });

  it("shows the policy host and snapshot host on their own lines (text + html)", () => {
    const [it] = buildHeldItems(
      [row({ id: 11, domain: "xn--bcher-kva.example", is_recheck: 0, source_url: "https://bücher.example/privacy", sourced_from_archive: 1, archived_source_url: "http://web.archive.org/web/2026/https://bücher.example/privacy" })],
      [], null
    );
    const t = renderItemText(it, true).split("\n");
    expect(t).toContain("Policy host: xn--bcher-kva.example");
    expect(t).toContain("Snapshot host: web.archive.org");
    expect(t.findIndex((l) => l.startsWith("Policy host:"))).toBe(t.findIndex((l) => l.startsWith("Policy checked:")) + 1);
    const h = renderHeldAlert(it, true).html;
    expect(h).toContain("<strong>xn--bcher-kva.example</strong>");
    expect(h).toContain("<strong>web.archive.org</strong>");
  });

  it("says 'not recorded' for missing facts, URL and dates", () => {
    const [it] = buildHeldItems([row({ id: 10, domain: "blank.com", is_recheck: 0, source_url: null, extracted_facts: null, updated_at: "", created_at: "" })], [], { contacts: [], sends: [], replies: [] });
    const t = renderItemText(it, true);
    expect(t).toContain("Policy checked: not recorded");
    expect(t).toContain("Policy host: not recorded");
    expect(t).not.toContain("Snapshot host");
    expect(t).toContain("Checked: not recorded");
    expect(t).toContain("Proposed verdict: not recorded");
    expect(t).toContain("Clarification email: none on record");
    expect(t).toContain("What you need to do:");
  });
});
