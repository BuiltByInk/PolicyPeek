import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./ssrf", () => ({
  safeFetchText: vi.fn(),
}));

const { tryWaybackFallback } = await import("./waybackFallback");
const { safeFetchText } = await import("./ssrf");

describe("tryWaybackFallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the availability API has no snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 }))
    );
    const result = await tryWaybackFallback("https://example.com/privacy");
    expect(result).toBeNull();
  });

  it("returns null when the availability API request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      })
    );
    const result = await tryWaybackFallback("https://example.com/privacy");
    expect(result).toBeNull();
  });

  it("fetches the closest snapshot and returns its text + URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: { available: true, url: "https://web.archive.org/web/20250101/https://example.com/privacy", timestamp: "20250101" },
            },
          }),
          { status: 200 }
        )
      )
    );
    vi.mocked(safeFetchText).mockResolvedValue("<html>archived policy text</html>");

    const result = await tryWaybackFallback("https://example.com/privacy");
    expect(result).toEqual({
      text: "<html>archived policy text</html>",
      archivedUrl: "https://web.archive.org/web/20250101/https://example.com/privacy",
    });
  });

  it("returns null when the snapshot itself fails to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: { available: true, url: "https://web.archive.org/web/20250101/https://example.com/privacy", timestamp: "20250101" },
            },
          }),
          { status: 200 }
        )
      )
    );
    vi.mocked(safeFetchText).mockRejectedValue(new Error("fetch_failed_500"));

    const result = await tryWaybackFallback("https://example.com/privacy");
    expect(result).toBeNull();
  });
});
