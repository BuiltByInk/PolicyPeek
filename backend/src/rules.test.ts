import { describe, it, expect } from "vitest";
import { computeVerdict, detectNotAiTool } from "./rules";
import type { ExtractedFacts } from "./extraction";

const clearlyNotCompliant: ExtractedFacts = {
  trains_on_user_data: true,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: false,
  relevant_clauses: [],
};

const trainsWithOptOut: ExtractedFacts = {
  trains_on_user_data: true,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: true,
  relevant_clauses: [],
};

// The real hancocyber.com extraction (pending_checks id 10) that triggered
// this whole category -- a generic WordPress privacy-policy template.
const hancoWordpressBoilerplate: ExtractedFacts = {
  trains_on_user_data: null,
  data_retention:
    "Comments and metadata retained indefinitely; comment opt-in cookies last one year; login cookies last two days; screen options cookies last one year; 'Remember Me' login persists two weeks; post edit cookie expires after 1 day",
  gdpr_mentioned: false,
  opt_out_available: true,
  relevant_clauses: [
    "If you leave a comment, the comment and its metadata are retained indefinitely.",
    "All users can see, edit, or delete their personal information at any time",
    "you can request to receive an exported file of the personal data we hold about you",
    "you can also request that we erase any personal data we hold about you",
    "If you leave a comment on our site you may opt-in to saving your name, email address and website in cookies",
  ],
};

// A genuinely unclear AI tool's policy -- null trains_on_user_data, but with
// AI-vocabulary present, so it must NOT get reclassified as not_ai_tool.
const genuineAiToolVagueClauses: ExtractedFacts = {
  trains_on_user_data: null,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: null,
  relevant_clauses: [
    "We may use inputs to improve our models over time.",
    "Contact privacy@example.com with questions about how we handle your data.",
  ],
};

// A real AI product with a lazy/thin privacy policy that happens to include
// one boilerplate cookie-consent line -- the false-positive case Elliot
// flagged. Only ONE generic category (cookie_session) should hit, so this
// must stay unrated, not get reclassified.
const thinAiPolicyWithOneCookieLine: ExtractedFacts = {
  trains_on_user_data: null,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: null,
  relevant_clauses: [
    "We use cookies for analytics and session management.",
    "See our Cookie Policy for opt-out details.",
  ],
};

describe("computeVerdict", () => {
  it("computes the normal verdict when sharedDomain isn't set (trains by default, no opt-out -> not_compliant)", () => {
    expect(computeVerdict(clearlyNotCompliant)).toBe("not_compliant");
  });

  it("trains by default WITH an opt-out is compliant_with_caveats, not plain compliant", () => {
    expect(computeVerdict(trainsWithOptOut)).toBe("compliant_with_caveats");
  });

  it("hard-overrides to shared_domain_unverified regardless of how clear the facts are", () => {
    expect(computeVerdict(clearlyNotCompliant, { sharedDomain: true })).toBe(
      "shared_domain_unverified"
    );
  });

  it("does not override when sharedDomain is explicitly false", () => {
    expect(computeVerdict(clearlyNotCompliant, { sharedDomain: false })).toBe("not_compliant");
  });

  it("computes not_ai_tool for the real hancocyber.com WordPress-boilerplate case", () => {
    expect(computeVerdict(hancoWordpressBoilerplate)).toBe("not_ai_tool");
  });

  it("stays unrated, not not_ai_tool, when relevant_clauses mention AI vocabulary", () => {
    expect(computeVerdict(genuineAiToolVagueClauses)).toBe("unrated");
  });

  it("stays unrated, not not_ai_tool, for a thin AI policy with only one generic-content category hit", () => {
    expect(computeVerdict(thinAiPolicyWithOneCookieLine)).toBe("unrated");
  });
});

describe("detectNotAiTool", () => {
  it("requires trains_on_user_data === null -- false whenever it's non-null, however generic the clauses", () => {
    expect(
      detectNotAiTool({ ...hancoWordpressBoilerplate, trains_on_user_data: true })
    ).toBe(false);
  });

  it("false when relevant_clauses has fewer than 2 entries even with a generic hit", () => {
    expect(
      detectNotAiTool({
        trains_on_user_data: null,
        data_retention: null,
        gdpr_mentioned: null,
        opt_out_available: null,
        relevant_clauses: ["If you leave a comment, it's retained indefinitely."],
      })
    ).toBe(false);
  });

  it("true for the real hancocyber.com case (comments_social + cookie_session categories)", () => {
    expect(detectNotAiTool(hancoWordpressBoilerplate)).toBe(true);
  });
});

// 2026-09-19: generic-category matching is whole-word. Before this, "cart" fired
// inside "cartography" and a bare "order" fired inside "in order to", which
// (with any cookie line) was enough to label a thin AI-tool policy not_ai_tool.
describe("detectNotAiTool -- whole-word generic matching", () => {
  const facts = (relevant_clauses: string[]): ExtractedFacts => ({
    trains_on_user_data: null,
    data_retention: null,
    gdpr_mentioned: null,
    opt_out_available: null,
    relevant_clauses,
  });

  it("does not treat the legal phrase 'in order to' as an ecommerce signal", () => {
    expect(
      detectNotAiTool(
        facts(["We use cookies to keep you signed in.", "We may share information in order to comply with legal obligations."])
      )
    ).toBe(false);
  });

  it("does not match a generic term inside a longer unrelated word", () => {
    expect(detectNotAiTool(facts(["Our cartography team reviews maps.", "We use cookies for analytics."]))).toBe(false);
  });

  it("still matches plural and inflected forms of a generic term", () => {
    expect(detectNotAiTool(facts(["Visitors can leave comments on posts.", "We set cookies to remember your login."]))).toBe(true);
  });

  it("still matches real ecommerce wording (paired with a distinctive category, per the later ruling)", () => {
    expect(detectNotAiTool(facts(["When you place an order we keep your shipping address.", "Visitors can leave a comment on the blog."]))).toBe(true);
  });

  it("keeps the real hancocyber.com case as not_ai_tool", () => {
    expect(computeVerdict(hancoWordpressBoilerplate)).toBe("not_ai_tool");
  });
});

// 2026-09-19 (Elliot: "go with recs"): everyday SaaS boilerplate can't make a
// policy "not an AI tool" on its own. It needs at least one category a normal
// software product wouldn't have (comments, embedded media, booking).
describe("detectNotAiTool -- SaaS boilerplate is not enough", () => {
  const facts = (relevant_clauses: string[]): ExtractedFacts => ({
    trains_on_user_data: null,
    data_retention: null,
    gdpr_mentioned: null,
    opt_out_available: null,
    relevant_clauses,
  });

  it("stays false for cookies plus payments", () => {
    expect(detectNotAiTool(facts(["We use cookies to keep you signed in.", "Payment details are handled by our processor."]))).toBe(false);
  });

  it("stays false for cookies plus a marketing email line", () => {
    expect(detectNotAiTool(facts(["We use cookies to keep you signed in.", "You can unsubscribe from our newsletter at any time."]))).toBe(false);
  });

  it("stays false for payments plus marketing email", () => {
    expect(detectNotAiTool(facts(["Payment is taken at checkout.", "Join our mailing list for updates."]))).toBe(false);
  });

  it("is true when a distinctive category joins a common one (the hancocyber.com shape)", () => {
    expect(detectNotAiTool(facts(["Visitors can leave a comment on the blog.", "We use a cookie to remember your login session."]))).toBe(true);
  });

  it("is true for two distinctive categories on their own", () => {
    expect(detectNotAiTool(facts(["Visitors can leave a comment on posts.", "Some pages show embedded content from other sites."]))).toBe(true);
  });

  it("stays false when only one distinctive category is present and nothing else", () => {
    expect(detectNotAiTool(facts(["Visitors can leave a comment on posts.", "Thank you for reading."]))).toBe(false);
  });
});
