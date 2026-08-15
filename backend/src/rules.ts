import type { ExtractedFacts } from "./extraction";

export type ComplianceStatus = "not_compliant" | "compliant" | "unrated" | "shared_domain_unverified";

// The one deterministic place a verdict gets assigned. The LLM extraction
// step (extraction.ts) never produces this — it only produces the facts
// this function reads.
//
//   not_compliant            — trains on user data by default, with no opt-out.
//   compliant                — doesn't train on user data, or training is opt-out-able.
//   unrated                  — genuinely unclear whether it trains on user data at all.
//   shared_domain_unverified — the tool's only public policy lives on a domain
//                              shared with unrelated products (e.g. a Google/
//                              Microsoft AI feature policy hosted on the parent
//                              company's apex domain). A hard override: no
//                              amount of clear facts makes a shared-domain
//                              policy specific to one product, so this branch
//                              short-circuits before the facts are even read.
export function computeVerdict(facts: ExtractedFacts, opts?: { sharedDomain?: boolean }): ComplianceStatus {
  if (opts?.sharedDomain) return "shared_domain_unverified";
  if (facts.trains_on_user_data === null) return "unrated";
  if (facts.trains_on_user_data === false) return "compliant";
  return facts.opt_out_available === true ? "compliant" : "not_compliant";
}
