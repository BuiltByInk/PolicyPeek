import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isBlockedIpLiteral, safeFetchText, SsrfBlockedError } from "./ssrf";

// Regression coverage for a real bug: the original isBlockedIpLiteral only
// caught the literal string "::1" for IPv6 loopback, missing equivalent
// forms (e.g. "0:0:0:0:0:0:0:1") and IPv4-mapped IPv6 like "::ffff:127.0.0.1"
// or "::ffff:169.254.169.254" (cloud metadata) — none of those were blocked.

describe("isBlockedIpLiteral", () => {
  it("blocks IPv4 private/loopback/link-local ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.1"]) {
      expect(isBlockedIpLiteral(ip)).toBe(true);
    }
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIpLiteral("93.184.216.34")).toBe(false);
    expect(isBlockedIpLiteral("8.8.8.8")).toBe(false);
  });

  it("blocks IPv6 loopback in every equivalent form", () => {
    for (const ip of ["::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001"]) {
      expect(isBlockedIpLiteral(ip)).toBe(true);
    }
  });

  it("blocks IPv6 link-local (fe80::/10) and unique-local (fc00::/7)", () => {
    expect(isBlockedIpLiteral("fe80::1")).toBe(true);
    expect(isBlockedIpLiteral("fc00::1")).toBe(true);
    expect(isBlockedIpLiteral("fd12:3456::1")).toBe(true);
  });

  it("blocks IPv4-mapped IPv6 addresses, including cloud metadata", () => {
    expect(isBlockedIpLiteral("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpLiteral("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIpLiteral("::ffff:10.0.0.1")).toBe(true);
  });

  it("allows a real public IPv6 address", () => {
    expect(isBlockedIpLiteral("2001:4860:4860::8888")).toBe(false);
  });
});

// Regression coverage for the real bug fixed 2026-08-18
// (security/review-2026-08-18.md finding #1): assertSafeUrl used to only
// inspect the literal hostname/IP string in the submitted URL and never the
// address DNS actually resolves it to, so a wildcard-DNS hostname like
// "169-254-169-254.nip.io" (a real service) sailed straight through and
// resolved to the cloud metadata IP at fetch()-time. Mocks global fetch with
// a dispatcher: requests to the DoH endpoint return synthetic DNS-over-HTTPS
// JSON, everything else is treated as the actual page fetch -- mirrors the
// vi.stubGlobal("fetch", ...) pattern used in waybackFallback.test.ts, no
// live network calls.
describe("safeFetchText — DNS-resolution SSRF defense", () => {
  const dohAnswer = (ips: string[], type: 1 | 28 = 1) => ({
    Answer: ips.map((data) => ({ type, data })),
  });

  function stubFetch(handlers: {
    dohA?: string[];
    dohAaaa?: string[];
    dohThrows?: boolean;
    page?: { status?: number; body?: string; location?: string };
  }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
          if (handlers.dohThrows) throw new Error("dns resolver unreachable");
          const isAaaa = url.includes("type=AAAA");
          const ips = isAaaa ? handlers.dohAaaa ?? [] : handlers.dohA ?? [];
          const type = isAaaa ? 28 : 1;
          return new Response(JSON.stringify(dohAnswer(ips, type)), { status: 200 });
        }
        // The actual page fetch.
        const status = handlers.page?.status ?? 200;
        if (status >= 300 && status < 400) {
          return new Response(null, {
            status,
            headers: handlers.page?.location ? { location: handlers.page.location } : {},
          });
        }
        return new Response(handlers.page?.body ?? "<html>ok</html>", { status });
      })
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows a hostname whose DNS resolution is a public address", async () => {
    stubFetch({ dohA: ["93.184.216.34"], dohAaaa: [], page: { body: "policy text" } });
    const text = await safeFetchText("https://example.com/privacy");
    expect(text).toBe("policy text");
  });

  it("blocks a wildcard-DNS hostname that resolves to the cloud metadata address", async () => {
    stubFetch({ dohA: ["169.254.169.254"], dohAaaa: [] });
    await expect(safeFetchText("https://169-254-169-254.nip.io/x")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks when any answer among several is unsafe, not only the first", async () => {
    stubFetch({ dohA: ["93.184.216.34", "127.0.0.1"], dohAaaa: [] });
    await expect(safeFetchText("https://example.com/privacy")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("blocks when the AAAA (not just A) answer resolves to a blocked address", async () => {
    stubFetch({ dohA: ["93.184.216.34"], dohAaaa: ["fe80::1"] });
    await expect(safeFetchText("https://example.com/privacy")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("fails closed when DNS resolution itself errors out", async () => {
    stubFetch({ dohThrows: true });
    await expect(safeFetchText("https://example.com/privacy")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("re-validates DNS on a redirect hop, not just the initial URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
          const isAaaa = url.includes("type=AAAA");
          if (url.includes("name=example.com")) {
            return new Response(JSON.stringify(dohAnswer(isAaaa ? [] : ["93.184.216.34"], isAaaa ? 28 : 1)), {
              status: 200,
            });
          }
          if (url.includes("name=169-254-169-254.nip.io")) {
            return new Response(
              JSON.stringify(dohAnswer(isAaaa ? [] : ["169.254.169.254"], isAaaa ? 28 : 1)),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify(dohAnswer([])), { status: 200 });
        }
        if (url === "https://example.com/privacy") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://169-254-169-254.nip.io/x" },
          });
        }
        return new Response("should not be reached", { status: 200 });
      })
    );

    await expect(safeFetchText("https://example.com/privacy")).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("skips DNS resolution for a hostname that is already a literal IP (still blocked by the literal check)", async () => {
    const fetchSpy = vi.fn(async () => new Response("unused", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(safeFetchText("http://127.0.0.1/x")).rejects.toBeInstanceOf(SsrfBlockedError);
    // Blocked by the literal-IP check before any fetch (DoH or page) happens.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("isBlockedIpLiteral — additional non-public IPv4 ranges", () => {
  it("blocks CGNAT, benchmarking, multicast and reserved/broadcast addresses", () => {
    for (const ip of ["100.64.0.1", "100.127.255.254", "198.18.0.1", "198.19.255.255", "224.0.0.1", "240.0.0.1", "255.255.255.255"]) {
      expect(isBlockedIpLiteral(ip)).toBe(true);
    }
  });

  it("still allows public neighbours of those ranges", () => {
    for (const ip of ["100.63.255.255", "100.128.0.1", "198.17.0.1", "198.20.0.1", "223.255.255.255"]) {
      expect(isBlockedIpLiteral(ip)).toBe(false);
    }
  });

  it("applies the same ranges to IPv4-mapped IPv6", () => {
    expect(isBlockedIpLiteral("::ffff:100.64.0.1")).toBe(true);
  });
});

describe("safeFetchText — URL shape restrictions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects non-default ports before making any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const url of ["https://example.com:22/x", "http://example.com:8080/x", "https://example.com:6379/"]) {
      await expect(safeFetchText(url)).rejects.toThrow(/blocked_port/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects credentials embedded in the URL", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(safeFetchText("https://user:pass@example.com/privacy")).rejects.toThrow(/blocked_credentials_in_url/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
