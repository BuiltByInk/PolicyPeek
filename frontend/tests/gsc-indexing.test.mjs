// GSC indexing fixes: _redirects for old 404s, Link/canonical on guide .md twins,
// and X-Robots-Tag: noindex on llms*.txt. Checks the public source files so the
// build's CSP rewrite is not required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const redirects = readFileSync(join(FRONTEND, "public/_redirects"), "utf8");
const headers = readFileSync(join(FRONTEND, "public/_headers"), "utf8");

test("_redirects maps GSC 404s to live pages", () => {
  const want = [
    ["/tools/notion.so", "/tools/notion.com/"],
    ["/tools/notion.so/", "/tools/notion.com/"],
    ["/tools/descript.com", "/tools/"],
    ["/tools/descript.com/", "/tools/"],
    ["/tools/synthesia.io", "/tools/"],
    ["/tools/synthesia.io/", "/tools/"],
    ["/tools/surferseo.com", "/tools/"],
    ["/tools/surferseo.com/", "/tools/"],
    ["/reports", "/tools/"],
    ["/reports/", "/tools/"],
  ];
  for (const [from, to] of want) {
    assert.match(redirects, new RegExp(`^${from.replace(/\./g, "\\.")}\\s+${to.replace(/\./g, "\\.")}\\s+301\\s*$`, "m"), `${from} -> ${to}`);
  }
  assert.doesNotMatch(redirects, /cdn-cgi|email-protection/);
});

test("_headers: guide .md twins get a Link canonical to the HTML guide", () => {
  assert.match(headers, /\/guides\/:slug\.md\n\s+Link: <https:\/\/getpolicypeek\.com\/guides\/:slug\/>; rel="canonical"/);
});

test("_headers: llms.txt and llms-full.txt are noindex but still served", () => {
  assert.match(headers, /\/llms\.txt\n\s+X-Robots-Tag: noindex/);
  assert.match(headers, /\/llms-full\.txt\n\s+X-Robots-Tag: noindex/);
});

test("public/_redirects is present for Cloudflare Pages", () => {
  assert.equal(existsSync(join(FRONTEND, "public/_redirects")), true);
});
