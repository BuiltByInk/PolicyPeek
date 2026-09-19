import type { ExtractedFacts } from "./extraction";

export type ComplianceStatus =
  | "not_compliant"
  | "compliant"
  | "compliant_with_caveats"
  | "unrated"
  | "shared_domain_unverified"
  | "not_ai_tool";

// AI/ML-vocabulary terms. Presence of ANY of these in relevant_clauses rules
// out not_ai_tool entirely -- this function's whole job is to find a total
// ABSENCE of AI-product language, so a single hit is disqualifying.
const AI_VOCAB = [
  "train",
  "model",
  "machine learning",
  "artificial intelligence",
  "generat", // generate/generative/generation
  "chatbot",
  "neural",
  "algorithm",
];

// Ordinary-website-mechanics categories, keyed by name so detectNotAiTool
// can count DISTINCT categories hit rather than raw keyword occurrences --
// two mentions of "cookie" is one category, not two signals. Each category
// is a family of terms that only make sense for a generic site (comments,
// logins, embedded media, checkout, marketing, booking) and have nothing to
// do with an AI/ML product's actual data-training practices.
const GENERIC_CONTENT_CATEGORIES: Record<string, string[]> = {
  comments_social: ["comment", "gravatar"],
  cookie_session: ["cookie", "login", "session", "remember me", "screen options"],
  embedded_media: ["embedded content", "embed"],
  ecommerce: ["cart", "checkout", "your order", "place an order", "order history", "order confirmation", "payment", "shipping", "purchase"],
  marketing_newsletter: ["newsletter", "subscribe", "mailing list", "marketing email"],
  booking_appointment: ["booking", "appointment", "reservation", "schedule a call"],
};

// Categories a normal software product wouldn't have. The rest (cookie_session,
// ecommerce, marketing_newsletter) are common SaaS boilerplate and never
// suffice on their own; see detectNotAiTool.
const DISTINCTIVE_GENERIC_CATEGORIES = new Set(["comments_social", "embedded_media", "booking_appointment"]);

// Whole-word match with an optional plural/verb ending, for the GENERIC
// categories only. Plain substring matching let short everyday words fire
// inside unrelated text: "cart" inside "cartography", and a bare "order" inside
// the near-universal legal phrase "in order to", which by itself was enough to
// turn a thin AI-tool policy into `not_ai_tool` (2026-09-19, Elliot's OK).
// AI_VOCAB deliberately stays substring-based: it matches stems ("train" ->
// training, "generat" -> generative), and over-matching there is the safe
// direction, since any hit blocks `not_ai_tool`.
function containsWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es|ed|ing)?\\b`, "i").test(text);
}

// Detects "this policy shows no sign the site is actually an AI/ML product"
// -- distinct from unrated's "we don't know," this is "there's nothing here
// TO know." Triggered by the hancocyber.com case (pending_checks id 10): a
// generic WordPress privacy-policy template, extracted cleanly, that never
// touches AI/training language at all.
//
// Three conditions, ALL required, or this returns false and the caller
// falls back to plain `unrated` exactly as before:
//
//   1. trains_on_user_data === null -- necessary but not sufficient (same
//      gate `unrated` already uses; this function is only ever consulted
//      when that's already true, see computeVerdict below).
//   2. Zero AI_VOCAB hits anywhere in relevant_clauses -- a genuine AI tool,
//      however unclear its data-training stance, would be expected to say
//      SOMETHING about training/models/generation somewhere in the quoted
//      clauses. Any hit disqualifies not_ai_tool outright.
//   3. relevant_clauses has at least 2 entries AND hits at least 2 DISTINCT
//      GENERIC_CONTENT_CATEGORIES -- a POSITIVE signal that what was
//      extracted is a real, substantive policy about ordinary site
//      mechanics, not just a thin/lazy AI policy that happens to say
//      nothing. This is the false-positive guard (Elliot, 2026-09-18): a
//      real AI product with a lazy privacy policy that has, say, one
//      boilerplate cookie-consent line would hit only ONE category and
//      correctly stay `unrated` rather than getting misclassified here.
//      Requiring 2+ distinct categories (not 2+ raw keyword hits, and not
//      just 1 category) means the evidence has to span more than one
//      unrelated generic topic before this fires.
export function detectNotAiTool(facts: ExtractedFacts): boolean {
  if (facts.trains_on_user_data !== null) return false;

  const text = facts.relevant_clauses.join(" \n ").toLowerCase();

  const hasAiVocab = AI_VOCAB.some((term) => text.includes(term));
  if (hasAiVocab) return false;

  if (facts.relevant_clauses.length < 2) return false;

  const hit = (category: string) => GENERIC_CONTENT_CATEGORIES[category].some((term) => containsWord(text, term));
  const hitCategories = Object.keys(GENERIC_CONTENT_CATEGORIES).filter(hit);

  // Ordinary SaaS boilerplate (cookies/login, payments, marketing email) shows
  // up in the thin policy of a real AI product just as often as in a blog's, so
  // those categories alone can never make this call. At least one hit must come
  // from a category a normal software product wouldn't have (comments, embedded
  // media, appointment booking). (2026-09-19, Elliot: "go with recs" on the
  // not_ai_tool boilerplate follow-up.)
  const hasDistinctive = hitCategories.some((c) => DISTINCTIVE_GENERIC_CATEGORIES.has(c));

  return hitCategories.length >= 2 && hasDistinctive;
}

// The one deterministic place a verdict gets assigned. The LLM extraction
// step (extraction.ts) never produces this — it only produces the facts
// this function reads.
//
//   not_compliant            — trains on user data by default, with no opt-out.
//   compliant                — doesn't train on user data, or training is opt-in/off-by-default.
//   compliant_with_caveats   — trains on user data by default, but an opt-out
//                              exists. Deliberately NOT folded into plain
//                              `compliant`: GDPR generally requires
//                              affirmative opt-in consent for this kind of
//                              processing, and an opt-out the user has to
//                              find and exercise themselves is a materially
//                              weaker guarantee than genuine opt-in or
//                              off-by-default. Ruling: Elliot, 2026-08-18.
//   unrated                  — genuinely unclear whether it trains on user data at all.
//   shared_domain_unverified — the tool's only public policy lives on a domain
//                              shared with unrelated products (e.g. a Google/
//                              Microsoft AI feature policy hosted on the parent
//                              company's apex domain). A hard override: no
//                              amount of clear facts makes a shared-domain
//                              policy specific to one product, so this branch
//                              short-circuits before the facts are even read.
//   not_ai_tool              — the policy shows no sign the submitted site is
//                              an AI/ML product at all (see detectNotAiTool
//                              above). A narrower carve-out of `unrated`, not
//                              a sibling of the training-practice verdicts --
//                              only reachable via the same null-training-data
//                              path `unrated` uses. Added 2026-09-18 after
//                              the hancocyber.com case; keyword-based and
//                              flagged in DECISIONS_NEEDED.md as an interim
//                              approach, not the long-term answer.
export function computeVerdict(facts: ExtractedFacts, opts?: { sharedDomain?: boolean }): ComplianceStatus {
  if (opts?.sharedDomain) return "shared_domain_unverified";
  if (facts.trains_on_user_data === null) {
    return detectNotAiTool(facts) ? "not_ai_tool" : "unrated";
  }
  if (facts.trains_on_user_data === false) return "compliant";
  return facts.opt_out_available === true ? "compliant_with_caveats" : "not_compliant";
}
