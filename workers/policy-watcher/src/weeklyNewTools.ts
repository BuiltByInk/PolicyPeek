// Task 4 (code only): change "2 new tools a day" to one weekly batch of 5–10.
// Does not research or add tools. Selection order: (a) Search Console pages
// or queries that are not yet in the catalog, once that data exists;
// (b) popular candidates in categories the catalog already covers.
// Every candidate must cite the vendor's own published page (same registrable
// host, https). New cards would then go through the Task 3 gate — this module
// only selects the batch.

export const WEEKLY_BATCH_MIN = 5;
export const WEEKLY_BATCH_MAX = 10;
export const DEFAULT_WEEKLY_BATCH_SIZE = 8;
export const DEFAULT_CATEGORIES = [
  "meeting-notes",
  "image",
  "video",
  "voice",
  "writing",
  "coding",
  "chat",
] as const;
export type CatalogCategory = (typeof DEFAULT_CATEGORIES)[number] | (string & {});

export interface SearchConsoleRow {
  page?: string;
  query?: string;
  clicks?: number;
  impressions?: number;
}

export interface NewToolCandidate {
  name: string;
  domain: string;
  category: CatalogCategory;
  sourceUrl: string;
  /** Higher is preferred. Search Console clicks, or a manual popularity rank. */
  score: number;
}

export interface SelectOpts {
  size?: number;
  existingDomains: Iterable<string>;
  searchConsole?: SearchConsoleRow[];
}

export function clampBatchSize(n: number | undefined): number {
  if (!Number.isFinite(n as number)) return DEFAULT_WEEKLY_BATCH_SIZE;
  return Math.min(WEEKLY_BATCH_MAX, Math.max(WEEKLY_BATCH_MIN, Math.round(n as number)));
}

/** Vendor's own https page: same registrable host as the tool domain (www ok). */
export function isVendorOwnPage(domain: string, sourceUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const host = bare(url.hostname);
  const tool = bare(domain);
  return host === tool || host.endsWith(`.${tool}`) || tool.endsWith(`.${host}`);
}

function domainFromPage(page: string): string | null {
  try {
    const u = new URL(page);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function selectWeeklyBatch(candidates: NewToolCandidate[], opts: SelectOpts): NewToolCandidate[] {
  const size = clampBatchSize(opts.size);
  const existing = new Set([...opts.existingDomains].map((d) => d.toLowerCase().replace(/^www\./, "")));

  const eligible = candidates.filter((c) => {
    const d = c.domain.toLowerCase().replace(/^www\./, "");
    return !existing.has(d) && isVendorOwnPage(c.domain, c.sourceUrl);
  });

  const scScore = new Map<string, number>();
  for (const row of opts.searchConsole ?? []) {
    const d = row.page ? domainFromPage(row.page) : null;
    if (!d || existing.has(d)) continue;
    scScore.set(d, (scScore.get(d) ?? 0) + (row.clicks ?? 0));
  }

  const ranked = eligible
    .map((c) => {
      const d = c.domain.toLowerCase().replace(/^www\./, "");
      const fromSc = scScore.get(d) ?? 0;
      // (a) Search Console clicks outrank (b) the candidate's own score.
      return { c, key: [fromSc > 0 ? 1 : 0, fromSc, c.score] as const };
    })
    .sort((a, b) => b.key[0] - a.key[0] || b.key[1] - a.key[1] || b.key[2] - a.key[2] || a.c.domain.localeCompare(b.c.domain))
    .map((x) => x.c);

  return ranked.slice(0, size);
}
