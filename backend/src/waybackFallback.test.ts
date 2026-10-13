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

  it("gives up on an availability lookup that never answers (it is called with a timeout signal)", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal?.aborted) reject(init.signal.reason);
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new Error("timed out")));

    expect(await tryWaybackFallback("https://example.com/privacy")).toBeNull();
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
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
