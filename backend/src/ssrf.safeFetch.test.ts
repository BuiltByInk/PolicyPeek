// safeFetch() options (Security review 2026-11-10: F3 https-only, F4 UA,
// non-2xx handling, truncated flag). DoH and page fetches are stubbed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetch, safeFetchTextWithFinalUrl, SsrfBlockedError } from "./ssrf";

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function stub(pages: Record<string, Handler>) {
  const calls: { url: string; ua: string | null }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        const type = new URL(url).searchParams.get("type");
        return new Response(JSON.stringify({ Answer: type === "A" ? [{ type: 1, data: "93.184.216.34" }] : [] }), { status: 200 });
      }
      calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
      const h = pages[url];
      if (!h) return new Response("not found", { status: 404 });
      return h(url, init);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("safeFetch", () => {
  it("httpsOnly refuses an http first URL before any page fetch", async () => {
    const calls = stub({});
    await expect(safeFetch("http://example.com/privacy", { httpsOnly: true })).rejects.toThrow(SsrfBlockedError);
    await expect(safeFetch("http://example.com/privacy", { httpsOnly: true })).rejects.toThrow("blocked_protocol_http");
    expect(calls).toHaveLength(0);
  });

  it("httpsOnly refuses a redirect hop to http", async () => {
    const calls = stub({
      "https://example.com/privacy": () => new Response(null, { status: 301, headers: { location: "http://example.com/privacy-old" } }),
      "http://example.com/privacy-old": () => new Response("should not be fetched"),
    });
    await expect(safeFetch("https://example.com/privacy", { httpsOnly: true })).rejects.toThrow("blocked_protocol_http");
    expect(calls.map((c) => c.url)).toEqual(["https://example.com/privacy"]);
  });

  it("without httpsOnly an http hop is still allowed (default behaviour unchanged)", async () => {
    stub({
      "https://example.com/a": () => new Response(null, { status: 302, headers: { location: "http://example.com/b" } }),
      "http://example.com/b": () => new Response("ok", { headers: { "content-type": "text/html" } }),
    });
    const r = await safeFetch("https://example.com/a");
    expect(r.status).toBe(200);
    expect(r.finalUrl).toBe("http://example.com/b");
  });

  it("sends the custom User-Agent on every hop; default UA is unchanged", async () => {
    const UA = "PolicyPeek-PolicyWatch/1.0 (+https://getpolicypeek.com/about; privacy@getpolicypeek.com)";
    const calls = stub({
      "https://example.com/a": () => new Response(null, { status: 301, headers: { location: "/b" } }),
      "https://example.com/b": () => new Response("ok"),
    });
    await safeFetch("https://example.com/a", { userAgent: UA, httpsOnly: true });
    expect(calls.map((c) => c.ua)).toEqual([UA, UA]);
    await safeFetch("https://example.com/b");
    expect(calls[calls.length - 1].ua).toBe("PolicyPeek-Checker/1.0");
  });

  it("non-2xx returns the status with empty bytes instead of throwing", async () => {
    stub({ "https://example.com/robots.txt": () => new Response("nope", { status: 404, headers: { "content-type": "text/plain" } }) });
    const r = await safeFetch("https://example.com/robots.txt", { httpsOnly: true });
    expect(r.status).toBe(404);
    expect(r.bytes.byteLength).toBe(0);
    expect(r.contentType).toBe("text/plain");
    expect(r.truncated).toBe(false);
  });

  it("safeFetchTextWithFinalUrl still throws fetch_failed_<status> on non-2xx", async () => {
    stub({ "https://example.com/gone": () => new Response("x", { status: 410 }) });
    await expect(safeFetchTextWithFinalUrl("https://example.com/gone")).rejects.toThrow("fetch_failed_410");
  });

  it("sets truncated when the body reaches maxBodyBytes, and false below it", async () => {
    const big = "a".repeat(5000);
    stub({
      "https://example.com/big": () => new Response(big, { headers: { "content-type": "text/html; charset=utf-8" } }),
      "https://example.com/small": () => new Response("tiny"),
    });
    const r = await safeFetch("https://example.com/big", { maxBodyBytes: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.bytes.byteLength).toBeGreaterThanOrEqual(1000);
    expect(r.contentType).toBe("text/html; charset=utf-8");
    const s = await safeFetch("https://example.com/small", { maxBodyBytes: 1000 });
    expect(s.truncated).toBe(false);
    expect(new TextDecoder().decode(s.bytes)).toBe("tiny");
  });

  it("aborts a slow hop after timeoutMs", async () => {
    stub({
      "https://example.com/slow": (_u, init) =>
        new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
    });
    await expect(safeFetch("https://example.com/slow", { timeoutMs: 50 })).rejects.toThrow("aborted");
  });
});
