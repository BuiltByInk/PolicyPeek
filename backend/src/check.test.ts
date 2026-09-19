import { describe, it, expect } from "vitest";
import { isSourceHostAllowedForDomain, cleanSubmittedName, nameForTier, isSameSiteAfterRedirect, sourceHostChanged, unexpectedFirstSourceHost, readBodyLimited } from "./check";

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

describe("cleanSubmittedName", () => {
  it("returns a normal name unchanged", () => {
    expect(cleanSubmittedName("Acme AI")).toBe("Acme AI");
  });

  it("returns null for missing, non-string or blank input", () => {
    for (const bad of [undefined, null, 42, {}, ["x"], "", "   ", "\n\t"]) {
      expect(cleanSubmittedName(bad)).toBeNull();
    }
  });

  it("strips control characters and collapses whitespace", () => {
    expect(cleanSubmittedName("Ac\u0000me\n  AI\u0007")).toBe("Ac me AI");
  });

  it("caps length at 100 characters", () => {
    expect(cleanSubmittedName("x".repeat(5000))).toHaveLength(100);
  });
});

describe("nameForTier", () => {
  it("ignores a submitted name from a free/anonymous caller", () => {
    expect(nameForTier("free", "Stripe")).toBeNull();
  });

  it("keeps a cleaned name for a paid-key caller", () => {
    expect(nameForTier("paid", "  Acme AI ")).toBe("Acme AI");
    expect(nameForTier("paid", undefined)).toBeNull();
  });
});

describe("isSameSiteAfterRedirect", () => {
  it("treats the domain, its subdomains and www. variants as the same site", () => {
    expect(isSameSiteAfterRedirect("acme.com", "acme.com")).toBe(true);
    expect(isSameSiteAfterRedirect("www.acme.com", "acme.com")).toBe(true);
    expect(isSameSiteAfterRedirect("legal.acme.com", "acme.com")).toBe(true);
    expect(isSameSiteAfterRedirect("acme.com", "www.acme.com")).toBe(true);
  });

  it("treats a redirect to an unrelated domain as leaving the site", () => {
    expect(isSameSiteAfterRedirect("evil.com", "acme.com")).toBe(false);
    expect(isSameSiteAfterRedirect("evil-acme.com", "acme.com")).toBe(false);
    expect(isSameSiteAfterRedirect("acme.com.evil.com", "acme.com")).toBe(false);
  });

  it("still allows the curated cross-domain source (bolt.new -> stackblitz.com)", () => {
    expect(isSameSiteAfterRedirect("stackblitz.com", "bolt.new")).toBe(true);
  });
});

describe("isSameSiteAfterRedirect -- www. widening is narrow", () => {
  it("does not let a submitted www.acme.com accept every other host under acme.com", () => {
    expect(isSameSiteAfterRedirect("docs.acme.com", "www.acme.com")).toBe(false);
    expect(isSameSiteAfterRedirect("legal.acme.com", "www.acme.com")).toBe(false);
  });

  it("still treats www.acme.com and acme.com as the same site, either way round", () => {
    expect(isSameSiteAfterRedirect("acme.com", "www.acme.com")).toBe(true);
    expect(isSameSiteAfterRedirect("www.acme.com", "acme.com")).toBe(true);
  });

  it("does not collapse a degenerate www.com to a bare TLD", () => {
    expect(isSameSiteAfterRedirect("com", "www.com")).toBe(false);
  });
});

describe("sourceHostChanged", () => {
  const stored = JSON.stringify(["https://acme.com/privacy"]);

  it("is null when the new source is on the same host as the published one", () => {
    expect(sourceHostChanged(stored, "https://acme.com/privacy-v2")).toBeNull();
    expect(sourceHostChanged(stored, "https://ACME.com/other")).toBeNull();
  });

  it("returns the new host when it differs, including a tenant subdomain of the same domain", () => {
    expect(sourceHostChanged(stored, "https://tenant.acme.com/privacy")).toBe("tenant.acme.com");
    expect(sourceHostChanged(stored, "https://evil.example/privacy")).toBe("evil.example");
  });

  it("ignores a leading www. on either side", () => {
    expect(sourceHostChanged(stored, "https://www.acme.com/privacy")).toBeNull();
    expect(sourceHostChanged(JSON.stringify(["https://www.acme.com/p"]), "https://acme.com/p")).toBeNull();
  });

  it("fails closed: missing or unparseable stored data counts as changed", () => {
    expect(sourceHostChanged(null, "https://acme.com/p")).toBe("acme.com");
    expect(sourceHostChanged("not json", "https://acme.com/p")).toBe("acme.com");
    expect(sourceHostChanged("[]", "https://acme.com/p")).toBe("acme.com");
  });
});

describe("unexpectedFirstSourceHost", () => {
  it("is null when the source is on the domain or its www. form", () => {
    expect(unexpectedFirstSourceHost("acme.com", "https://acme.com/privacy")).toBeNull();
    expect(unexpectedFirstSourceHost("acme.com", "https://www.acme.com/privacy")).toBeNull();
    expect(unexpectedFirstSourceHost("www.acme.com", "https://acme.com/privacy")).toBeNull();
  });

  it("returns the host when a first publish rests on some other host, such as a tenant of a multi-tenant site", () => {
    expect(unexpectedFirstSourceHost("substack.com", "https://someone.substack.com/privacy")).toBe("someone.substack.com");
    expect(unexpectedFirstSourceHost("acme.com", "https://legal.acme.com/privacy")).toBe("legal.acme.com");
  });
});

describe("readBodyLimited", () => {
  const req = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://example.com", { method: "POST", body, headers });

  it("returns the text of a small body", async () => {
    expect(await readBodyLimited(req('{"a":1}'), 100)).toBe('{"a":1}');
  });

  it("returns null once the body exceeds the cap", async () => {
    expect(await readBodyLimited(req("x".repeat(101)), 100)).toBeNull();
  });

  it("refuses a declared Content-Length over the cap without reading", async () => {
    expect(await readBodyLimited(req("small", { "content-length": "999999" }), 100)).toBeNull();
  });

  it("counts bytes, not characters", async () => {
    expect(await readBodyLimited(req("é".repeat(60)), 100)).toBeNull(); // 120 bytes
  });
});
