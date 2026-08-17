import { describe, it, expect } from "vitest";
import { isKnownSharedDomain } from "./sharedDomains";

describe("isKnownSharedDomain", () => {
  it("flags known multi-product apex domains", () => {
    expect(isKnownSharedDomain("google.com")).toBe(true);
    expect(isKnownSharedDomain("microsoft.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isKnownSharedDomain("Google.com")).toBe(true);
  });

  it("does not flag single-product domains", () => {
    expect(isKnownSharedDomain("openai.com")).toBe(false);
    expect(isKnownSharedDomain("acme-ai-startup.com")).toBe(false);
  });

  it("does not flag a subdomain of a shared domain as if it were the apex", () => {
    // Callers pass the already-resolved registration domain, not raw
    // hostnames -- a subdomain shouldn't match unless explicitly listed.
    expect(isKnownSharedDomain("mail.google.com")).toBe(false);
  });
});
