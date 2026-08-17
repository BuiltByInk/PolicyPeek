import type { ExtractedFacts } from "./extraction";
import { computeVerdict, type ComplianceStatus } from "./rules";

export interface AutoPublishResult {
  eligible: boolean;
  verdict: ComplianceStatus;
  reason: string;
}

// Tier A ("auto-publish") vs tier B ("queue for human review") from a
// pending_check that finished extraction. The bar is deliberately narrow:
// eligible only when nothing about this result requires judgment, not
// merely when the numbers look plausible.
//
//   - trains_on_user_data === null means the source page didn't actually
//     answer the question -- exactly the failure mode a wrong/empty-content
//     source URL produces (see the Claude nav-portal case in
//     DECISIONS_NEEDED.md). Queue it; a null fact is a red flag about the
//     source, not a genuinely-unclear-policy verdict.
//   - trains_on_user_data === true with opt_out_available === null is the
//     same problem: the one fact that decides compliant vs. not_compliant
//     is missing.
//   - shared_domain is resolved by a curated list (sharedDomains.ts), not a
//     judgment call made per-submission, so it doesn't block eligibility.
//   - On a recheck (this domain is already published), a verdict that would
//     *change* the existing badge always queues for review, however clean
//     the facts are -- a flip is exactly the event a human should see, per
//     the "static source, but verify periodically" design.
export function evaluateAutoPublish(
  facts: ExtractedFacts,
  opts: { sharedDomain: boolean; isRecheck: boolean; existingStatus?: ComplianceStatus }
): AutoPublishResult {
  const verdict = computeVerdict(facts, { sharedDomain: opts.sharedDomain });

  if (facts.trains_on_user_data === null) {
    return { eligible: false, verdict, reason: "trains_on_user_data is null -- source page didn't answer the key question" };
  }
  if (facts.trains_on_user_data === true && facts.opt_out_available === null) {
    return { eligible: false, verdict, reason: "opt_out_available is null -- can't determine compliant vs. not_compliant" };
  }
  if (opts.isRecheck && opts.existingStatus !== undefined && verdict !== opts.existingStatus) {
    return {
      eligible: false,
      verdict,
      reason: `recheck verdict changed (${opts.existingStatus} -> ${verdict}) -- status flips always get a human look`,
    };
  }

  return { eligible: true, verdict, reason: "clean extraction, deterministic verdict" };
}
