import { describe, it, expect } from "vitest";
import { evaluateAutoPublish } from "./autoPublish";
import type { ExtractedFacts } from "./extraction";

const clean: ExtractedFacts = {
  trains_on_user_data: false,
  data_retention: "90 days",
  gdpr_mentioned: true,
  opt_out_available: null,
  relevant_clauses: ["We do not train on your content."],
};

const emptyExtraction: ExtractedFacts = {
  trains_on_user_data: null,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: null,
  relevant_clauses: [],
};

const trainsWithNoOptOutAnswer: ExtractedFacts = {
  trains_on_user_data: true,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: null,
  relevant_clauses: [],
};

const trainsWithOptOut: ExtractedFacts = {
  trains_on_user_data: true,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: true,
  relevant_clauses: ["You can opt out of training in account settings."],
};

describe("evaluateAutoPublish", () => {
  it("is NOT eligible for a favourable verdict on a brand-new domain -- a person reads it first (Elliot, 2026-09-19)", () => {
    const result = evaluateAutoPublish(clean, { sharedDomain: false, isRecheck: false });
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe("compliant");
    expect(result.reason).toMatch(/brand-new domain with a favourable verdict/);
  });

  it("is still eligible for an unfavourable first result (not_compliant) on a fresh domain", () => {
    const noOptOut: ExtractedFacts = { ...trainsWithOptOut, opt_out_available: false };
    const result = evaluateAutoPublish(noOptOut, { sharedDomain: false, isRecheck: false });
    expect(result.eligible).toBe(true);
    expect(result.verdict).toBe("not_compliant");
  });

  it("rejects a null trains_on_user_data -- the source page didn't actually answer the question", () => {
    const result = evaluateAutoPublish(emptyExtraction, { sharedDomain: false, isRecheck: false });
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe("unrated");
    expect(result.reason).toMatch(/trains_on_user_data is null/);
  });

  it("rejects trains=true with opt_out_available unanswered -- the deciding fact is missing", () => {
    const result = evaluateAutoPublish(trainsWithNoOptOutAnswer, { sharedDomain: false, isRecheck: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/opt_out_available is null/);
  });

  it("is eligible on a known shared domain -- the heuristic list resolves it deterministically", () => {
    const result = evaluateAutoPublish(clean, { sharedDomain: true, isRecheck: false });
    expect(result.eligible).toBe(true);
    expect(result.verdict).toBe("shared_domain_unverified");
  });

  it("is eligible on a recheck when the verdict matches the existing published status", () => {
    const result = evaluateAutoPublish(clean, {
      sharedDomain: false,
      isRecheck: true,
      existingStatus: "compliant",
    });
    expect(result.eligible).toBe(true);
  });

  it("is NOT eligible when sourced from a Wayback Machine snapshot, even with otherwise-clean facts", () => {
    const result = evaluateAutoPublish(clean, { sharedDomain: false, isRecheck: false, sourcedFromArchive: true });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/Wayback Machine/);
  });

  it("is NOT eligible for compliant_with_caveats on a brand-new domain either", () => {
    const result = evaluateAutoPublish(trainsWithOptOut, { sharedDomain: false, isRecheck: false });
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe("compliant_with_caveats");
  });

  it("is eligible for compliant_with_caveats on a recheck that keeps the same verdict", () => {
    const result = evaluateAutoPublish(trainsWithOptOut, {
      sharedDomain: false,
      isRecheck: true,
      existingStatus: "compliant_with_caveats",
    });
    expect(result.eligible).toBe(true);
  });

  it("is NOT eligible on a recheck when the verdict would flip the existing published status", () => {
    const result = evaluateAutoPublish(clean, {
      sharedDomain: false,
      isRecheck: true,
      existingStatus: "not_compliant",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/verdict changed/);
  });
});
