import { describe, it, expect } from "vitest";
import { isBlockedIpLiteral } from "./ssrf";

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
