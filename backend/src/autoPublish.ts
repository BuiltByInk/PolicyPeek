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
//   - Since 2026-09-19 there is ONE deliberate exception to "never branches on
//     which verdict computeVerdict landed on": a brand-new domain whose verdict
//     is favourable (compliant / compliant_with_caveats) always queues for a
//     human. Everything else below is still about extraction confidence, not
//     verdict favourability.
//   - (Original wording:) Eligibility never branches on *which* verdict
//     computeVerdict landed on (deliberately -- this function is about
//     extraction confidence, not verdict favorability). 'compliant_with_caveats' (trains_on_user_data
//     === true, opt_out_available === true) is therefore auto-publish
//     eligible under exactly the same conditions as 'compliant' or
//     'not_compliant': both facts are non-null, so it clears the two null
//     checks above like any other determinate combination. It gets no
//     extra scrutiny tier of its own -- if a case ever needs one, that's a
//     verdict-generosity judgment call for rules.ts, not this function.
export function evaluateAutoPublish(
  facts: ExtractedFacts,
  opts: { sharedDomain: boolean; isRecheck: boolean; existingStatus?: ComplianceStatus; sourcedFromArchive?: boolean }
): AutoPublishResult {
  const verdict = computeVerdict(facts, { sharedDomain: opts.sharedDomain });

  if (opts.sourcedFromArchive) {
    return {
      eligible: false,
      verdict,
      reason: "sourced from a Wayback Machine snapshot, not the live page -- always gets a human look",
    };
  }
  // A favourable badge (green or teal) for a domain that has never been
  // published always gets a human look first (Elliot, 2026-09-19). Anyone can
  // submit a domain they control, and a scam site with a clean-looking page
  // must not be able to show a green badge in the extension without a person
  // reading it. An unfavourable or unrated first result can still publish by
  // itself, and a recheck of an existing entry is governed by the flip rule
  // below.
  if (!opts.isRecheck && (verdict === "compliant" || verdict === "compliant_with_caveats")) {
    return {
      eligible: false,
      verdict,
      reason: `brand-new domain with a favourable verdict (${verdict}) -- always gets a human look before a green or teal badge goes live`,
    };
  }
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
