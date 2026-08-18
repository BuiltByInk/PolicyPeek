// Domains where a submitted product's genuine, owner-published policy lives
// on a *different* domain than the product itself -- not a subdomain, a
// wholly separate registered domain owned by the same legal entity (e.g.
// Bolt.new is a StackBlitz product; its privacy policy is only published
// under stackblitz.com). isSourceHostAllowedForDomain (check.ts) exists to
// stop someone submitting fake facts about "victim.com" by pointing the
// source at an unrelated "attacker.com" page they control -- this map is a
// narrow, explicit exception to that check for the cases where the
// "unrelated" domain is actually the true, verified owner, not a spoof.
//
// Curated by hand, not derived (there's no reliable signal in the fetched
// policy text itself that proves real-world corporate ownership). Only add
// an entry once the relationship has actually been confirmed -- WHOIS, an
// official acquisition/product announcement, cross-links between the two
// sites -- never inferred automatically from a fetched page, since that
// would recreate the exact spoofing vector this check exists to close.
// Extend this list by hand when a new verified case shows up.
const CROSS_DOMAIN_SOURCES: Record<string, string> = {
  "bolt.new": "stackblitz.com",
};

export function allowedCrossDomainSource(domain: string): string | null {
  return CROSS_DOMAIN_SOURCES[domain.toLowerCase()] ?? null;
}
