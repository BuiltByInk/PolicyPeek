import { describe, it, expect } from "vitest";
import { computeVerdict } from "./rules";
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
});
