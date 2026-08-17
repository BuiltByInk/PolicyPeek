// Domains where a submitted AI product's only public policy lives on a
// large multi-product company's apex domain (e.g. Gemini's policy is under
// google.com, which also serves Search, Ads, Drive, and everything else
// Google ships). A badge registered at that apex would otherwise apply to
// every unrelated product under the same domain -- see rules.ts's
// "shared_domain_unverified" branch, which this list feeds.
//
// Curated by hand, not derived (there's no reliable signal in the fetched
// policy text itself that says "this company has other products"). Extend
// this list, don't try to infer it, when a new multi-product parent domain
// shows up in a submission.
const KNOWN_SHARED_DOMAINS = new Set([
  "google.com",
  "microsoft.com",
  "amazon.com",
  "apple.com",
  "meta.com",
  "adobe.com",
  "salesforce.com",
  "oracle.com",
  "ibm.com",
]);

export function isKnownSharedDomain(domain: string): boolean {
  return KNOWN_SHARED_DOMAINS.has(domain.toLowerCase());
}
