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

  // 2026-09-19 (independent security review H1): this test used to assert the
  // opposite, on the premise that callers pass an already-resolved registration
  // domain. They don't: /v1/check takes the submitted hostname as typed and the
  // extension submits the tab's hostname (usually www.), so an exact-only match
  // let www.adobe.com or gemini.google.com skip the override and publish a
  // product-specific badge for a multi-product company.
  it("flags subdomains of a shared domain too (www., product hosts)", () => {
    expect(isKnownSharedDomain("mail.google.com")).toBe(true);
    expect(isKnownSharedDomain("www.adobe.com")).toBe(true);
    expect(isKnownSharedDomain("gemini.google.com")).toBe(true);
    expect(isKnownSharedDomain("WWW.Apple.COM")).toBe(true);
    expect(isKnownSharedDomain("google.com.")).toBe(true);
  });

  it("does not flag look-alike domains that merely end with the same letters", () => {
    expect(isKnownSharedDomain("notgoogle.com")).toBe(false);
    expect(isKnownSharedDomain("google.com.evil.example")).toBe(false);
    expect(isKnownSharedDomain("ibm.com.au")).toBe(false);
  });
});
