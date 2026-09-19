import { describe, it, expect } from "vitest";
import { isPublicSuffix } from "./domainUtil";
import { suffixCandidates } from "./lookup";

describe("isPublicSuffix", () => {
  it("flags ICANN suffixes and hosting-platform (private) suffixes", () => {
    for (const s of ["co.uk", "com.au", "github.io", "vercel.app", "pages.dev", "notion.site", "netlify.app", "herokuapp.com"]) {
      expect(isPublicSuffix(s)).toBe(true);
    }
  });

  it("does not flag a registrable domain or a tenant under a hosting platform", () => {
    for (const d of ["acme.com", "bbc.co.uk", "attacker.github.io", "x.vercel.app", "www.adobe.com"]) {
      expect(isPublicSuffix(d)).toBe(false);
    }
  });
});

describe("suffixCandidates never falls back to a public suffix", () => {
  it("stops at the registrable domain for a tenant of a hosting platform", () => {
    expect(suffixCandidates("attacker.github.io")).toEqual(["attacker.github.io"]);
    expect(suffixCandidates("app.team.vercel.app")).toEqual(["app.team.vercel.app", "team.vercel.app"]);
  });

  it("does not offer co.uk for a UK site", () => {
    expect(suffixCandidates("www.bbc.co.uk")).toEqual(["www.bbc.co.uk", "bbc.co.uk"]);
  });

  it("keeps the normal parent walk for ordinary domains", () => {
    expect(suffixCandidates("checkout.shop.example.com")).toEqual(["checkout.shop.example.com", "shop.example.com", "example.com"]);
  });
});
