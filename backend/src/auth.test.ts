import { describe, it, expect } from "vitest";
import { getClientIp } from "./auth";

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP (edge-set, not client-suppliable)", () => {
    const request = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "203.0.113.5", "X-Forwarded-For": "198.51.100.1" },
    });
    expect(getClientIp(request)).toBe("203.0.113.5");
  });

  it("falls back to the first hop of X-Forwarded-For when CF-Connecting-IP is absent", () => {
    const request = new Request("https://example.com", {
      headers: { "X-Forwarded-For": "198.51.100.1, 10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("198.51.100.1");
  });

  it("falls back to 'unknown' when neither header is present", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });
});
