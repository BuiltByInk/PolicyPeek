import type { ExtractedFacts } from "./extraction";

export type ComplianceStatus = "not_compliant" | "compliant" | "unrated";

// The one deterministic place a verdict gets assigned. The LLM extraction
// step (extraction.ts) never produces this — it only produces the facts
// this function reads.
//
//   not_compliant — trains on user data by default, with no opt-out.
//   compliant     — doesn't train on user data, or training is opt-out-able.
//   unrated       — genuinely unclear whether it trains on user data at all.
export function computeVerdict(facts: ExtractedFacts): ComplianceStatus {
  if (facts.trains_on_user_data === null) return "unrated";
  if (facts.trains_on_user_data === false) return "compliant";
  return facts.opt_out_available === true ? "compliant" : "not_compliant";
}
