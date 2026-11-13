import { describe, expect, it } from "vitest";
import {
  clampBatchSize,
  DEFAULT_WEEKLY_BATCH_SIZE,
  isVendorOwnPage,
  selectWeeklyBatch,
  WEEKLY_BATCH_MAX,
  WEEKLY_BATCH_MIN,
  type NewToolCandidate,
} from "../src/weeklyNewTools";

const cand = (over: Partial<NewToolCandidate> & Pick<NewToolCandidate, "domain">): NewToolCandidate => ({
  name: over.name ?? over.domain,
  category: over.category ?? "chat",
  sourceUrl: over.sourceUrl ?? `https://${over.domain}/privacy`,
  score: over.score ?? 1,
  ...over,
});

describe("weekly batch cadence", () => {
  it("clamps the configurable size to 5–10", () => {
    expect(clampBatchSize(undefined)).toBe(DEFAULT_WEEKLY_BATCH_SIZE);
    expect(clampBatchSize(2)).toBe(WEEKLY_BATCH_MIN);
    expect(clampBatchSize(99)).toBe(WEEKLY_BATCH_MAX);
    expect(clampBatchSize(7)).toBe(7);
  });

  it("requires a vendor-owned https page, not a third-party article", () => {
    expect(isVendorOwnPage("acme.com", "https://acme.com/privacy")).toBe(true);
    expect(isVendorOwnPage("acme.com", "https://www.acme.com/legal/privacy")).toBe(true);
    expect(isVendorOwnPage("acme.com", "https://help.acme.com/privacy")).toBe(true);
    expect(isVendorOwnPage("acme.com", "http://acme.com/privacy")).toBe(false);
    expect(isVendorOwnPage("acme.com", "https://techcrunch.com/acme-privacy-policy")).toBe(false);
    expect(isVendorOwnPage("acme.com", "not a url")).toBe(false);
  });

  it("skips tools already in the catalog and third-party sources, prefers Search Console, then score", () => {
    const pool = [
      cand({ domain: "already.com", score: 100 }),
      cand({ domain: "third.com", sourceUrl: "https://blog.example/review", score: 90 }),
      cand({ domain: "hot.com", score: 2 }),
      cand({ domain: "mid.com", score: 50 }),
      cand({ domain: "low.com", score: 1 }),
      cand({ domain: "a.com", score: 3 }),
      cand({ domain: "b.com", score: 3 }),
      cand({ domain: "c.com", score: 3 }),
      cand({ domain: "d.com", score: 3 }),
    ];
    const batch = selectWeeklyBatch(pool, {
      size: 5,
      existingDomains: ["already.com", "www.other.com"],
      searchConsole: [{ page: "https://www.hot.com/pricing", clicks: 40 }, { page: "https://already.com/", clicks: 999 }],
    });
    expect(batch.map((c) => c.domain)).toEqual(["hot.com", "mid.com", "a.com", "b.com", "c.com"]);
    expect(batch).toHaveLength(5);
    expect(batch.every((c) => isVendorOwnPage(c.domain, c.sourceUrl))).toBe(true);
  });
});
