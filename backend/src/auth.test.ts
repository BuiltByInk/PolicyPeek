import { describe, it, expect } from "vitest";
import { getClientIp, normalizeIpForRateLimit } from "./auth";

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP (edge-set, not client-suppliable)", () => {
    const request = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "203.0.113.5", "X-Forwarded-For": "198.51.100.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("only believes X-Forwarded-For when running locally (wrangler dev)", () => {
    const local = new Request("http://localhost:8787/v1/check", {
      headers: { "X-Forwarded-For": "198.51.100.1, 10.0.0.1" },
    });
    expect(getClientIp(local)).toBe("198.51.100.1");
  });

  it("ignores a client-supplied X-Forwarded-For in production, so a caller can't pick their own identity", () => {
    const prod = new Request("https://api.getpolicypeek.com/v1/check", {
      headers: { "X-Forwarded-For": "198.51.100.1" },
    });
    expect(getClientIp(prod)).toBe("unknown");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });
});

describe("normalizeIpForRateLimit", () => {
  it("leaves IPv4 addresses alone", () => {
    expect(normalizeIpForRateLimit("203.0.113.5")).toBe("203.0.113.5");
  });

  it("collapses every address in one IPv6 /64 to the same key", () => {
    const a = normalizeIpForRateLimit("2001:db8:abcd:12:1111:2222:3333:4444");
    const b = normalizeIpForRateLimit("2001:0db8:abcd:0012:ffff::1");
    expect(a).toBe(b);
    expect(a).toBe("2001:db8:abcd:12::/64");
  });

  it("keeps different /64 networks separate", () => {
    expect(normalizeIpForRateLimit("2001:db8:abcd:12::1")).not.toBe(normalizeIpForRateLimit("2001:db8:abcd:13::1"));
  });

  it("maps unparseable input to 'unknown' instead of giving it its own key", () => {
    expect(normalizeIpForRateLimit("not:an:ip:::::x")).toBe("unknown");
    expect(normalizeIpForRateLimit("fe80::1%eth0")).toBe("unknown");
    expect(normalizeIpForRateLimit("garbage")).toBe("unknown");
  });

  it("turns IPv4-mapped IPv6 back into the IPv4 address, so one client has one identity", () => {
    expect(normalizeIpForRateLimit("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(normalizeIpForRateLimit("::ffff:cb00:7105")).toBe("203.0.113.5");
    expect(normalizeIpForRateLimit("[2001:db8::1]")).toBe("2001:db8:0:0::/64");
  });

  it("applies to CF-Connecting-IP in getClientIp", () => {
    const request = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "2001:db8::1" },
    });
    expect(getClientIp(request)).toBe("2001:db8:0:0::/64");
  });
});
