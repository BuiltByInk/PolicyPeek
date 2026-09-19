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
  "vercel.com",
]);

// Matches the listed domain AND anything under it (www.adobe.com,
// gemini.google.com). An exact-only match let the extension's ordinary path
// (it submits the tab's hostname, usually with a www.) skip this override and
// auto-publish a product-specific badge for a multi-product company. A trailing
// dot is ignored. (2026-09-19, independent security review H1.)
export function isKnownSharedDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/\.$/, "");
  for (const shared of KNOWN_SHARED_DOMAINS) {
    if (d === shared || d.endsWith(`.${shared}`)) return true;
  }
  return false;
}
