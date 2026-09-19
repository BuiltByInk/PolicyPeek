import { getDomain } from "tldts";

// A "public suffix" is a domain that other, unrelated parties register names
// under: co.uk, com.au, and hosting platforms such as github.io, vercel.app,
// pages.dev, notion.site (the private section of the Public Suffix List).
// Nobody can be "the owner" of one, so it must never be a catalog entry, and a
// lookup must never fall back to it (that would hand one tenant's verdict to
// every other tenant). tldts bundles the list; getDomain() returns null when
// the input is itself a public suffix.
const OPTIONS = { allowPrivateDomains: true } as const;

export function isPublicSuffix(host: string): boolean {
  return getDomain(host.toLowerCase(), OPTIONS) === null;
}
