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

  // Curated cross-domain exception (crossDomainSources.ts): Bolt.new's real
  // policy lives on stackblitz.com, a verified-legitimate different domain
  // owned by the same company, not a spoof target.
  it("allows the curated cross-domain source for bolt.new", () => {
    expect(isSourceHostAllowedForDomain("stackblitz.com", "bolt.new")).toBe(true);
  });

  it("allows a subdomain of the curated cross-domain source", () => {
    expect(isSourceHostAllowedForDomain("docs.stackblitz.com", "bolt.new")).toBe(true);
  });

  // Proves the exception is narrow, not a general loosening: an unrelated
  // domain substituted in place of the curated one must still be rejected,
  // even for a domain that does have a legitimate cross-domain entry.
  it("still rejects an unrelated domain substituted for bolt.new's real source", () => {
    expect(isSourceHostAllowedForDomain("evil.com", "bolt.new")).toBe(false);
  });

  // Same lookalike-suffix boundary bug as the primary check (line 18 above),
  // but for the cross-domain branch specifically: a naive `.includes()` or
  // `.endsWith(cd)` without the dot-boundary check would let these through.
  it("rejects lookalike/suffix-spoofed variants of the curated cross-domain source", () => {
    expect(isSourceHostAllowedForDomain("evilstackblitz.com", "bolt.new")).toBe(false);
    expect(isSourceHostAllowedForDomain("stackblitz.com.evil.com", "bolt.new")).toBe(false);
  });
});
