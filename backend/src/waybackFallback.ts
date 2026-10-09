// Fallback source for domains whose live page actively blocks automated
// fetchers -- confirmed structural (not a retry-fixable blip) for Windsurf
// and Adobe Firefly, see DECISIONS_NEEDED.md's 2026-08-17 entry. Only
// consulted after a normal fetch genuinely fails to connect/respond --
// never preferred over a live fetch, and the caller must track that the
// result came from here (fetchPolicyText's sourcedFromArchive) rather than
// silently presenting archived text as a live check.

import { safeFetchText } from "./ssrf";

interface WaybackAvailableResponse {
  archived_snapshots?: {
    closest?: { available: boolean; url: string; timestamp: string };
  };
}

// The availability lookup had no timeout, so a slow archive.org could hold a
// POST /v1/check open past the website form's own client timeout: the visitor
// saw an error while their daily check was still in use. Same bound as the
// DNS check in ssrf.ts plus margin; the snapshot fetch itself goes through
// safeFetchText, which has its own per-hop timeout.
const AVAILABILITY_TIMEOUT_MS = 10_000;

export interface WaybackResult {
  text: string;
  archivedUrl: string;
}

// archive.org's availability endpoint is a fixed, hardcoded host -- not
// attacker-influenced user input -- so this calls fetch() directly rather
// than routing through safeFetchText's SSRF checks (those exist for
// user-submitted URLs, which this isn't).
export async function tryWaybackFallback(sourceUrl: string): Promise<WaybackResult | null> {
  let snapshotUrl: string;
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(sourceUrl)}`, {
      signal: AbortSignal.timeout(AVAILABILITY_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as WaybackAvailableResponse;
    const closest = data.archived_snapshots?.closest;
    if (!closest?.available || !closest.url) return null;
    snapshotUrl = closest.url;
  } catch {
    return null;
  }

  try {
    // The snapshot URL is itself a normal, safeFetchText-compatible
    // https://web.archive.org/... URL, so it still goes through the same
    // SSRF-safe fetch as everything else.
    const text = await safeFetchText(snapshotUrl);
    return { text, archivedUrl: snapshotUrl };
  } catch {
    return null;
  }
}
