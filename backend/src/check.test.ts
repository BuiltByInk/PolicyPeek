import { describe, it, expect } from "vitest";
import { isSourceHostAllowedForDomain } from "./check";

// Regression coverage for a real bug: the original check used a bare
// hostname.endsWith(domain), which let "evil-acme.com" pass for domain
// "acme.com" since the raw string "acme.com" is a suffix of both.

describe("isSourceHostAllowedForDomain", () => {
  it("allows an exact match", () => {
    expect(isSourceHostAllowedForDomain("acme.com", "acme.com")).toBe(true);
  });

  it("allows a real subdomain", () => {
    expect(isSourceHostAllowedForDomain("sub.acme.com", "acme.com")).toBe(true);
    expect(isSourceHostAllowedForDomain("legal.sub.acme.com", "acme.com")).toBe(true);
  });

  it("rejects a lookalike domain that merely ends with the same suffix", () => {
    expect(isSourceHostAllowedForDomain("evil-acme.com", "acme.com")).toBe(false);
    expect(isSourceHostAllowedForDomain("notacme.com", "acme.com")).toBe(false);
  });

  it("rejects an unrelated domain", () => {
    expect(isSourceHostAllowedForDomain("evil.com", "acme.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isSourceHostAllowedForDomain("SUB.ACME.COM", "acme.com")).toBe(true);
  });
});
