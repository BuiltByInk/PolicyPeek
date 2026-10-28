// Static checks on the dated Q&A pages (/questions/<slug>/): verdict wording
// matches the catalog, Last checked date, sources, canonical, FAQPage, sitemap.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const src = readFileSync(join(FRONTEND, "src/qa.ts"), "utf8");
const pages = [...src.matchAll(/slug: "([^"]+)", domain: "([^"]+)", optOutQuote: (null|"[^"]*")/g)]
  .map(([, slug, domain, q]) => ({ slug, domain, optOutQuote: q === "null" ? null : JSON.parse(q) }));
const ANSWER = { compliant: "No.", compliant_with_caveats: "Yes, by default.", not_compliant: "Yes." };
let dir;
const read = (p) => readFileSync(join(dir, p), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;");

before(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-qa-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));

test("three Q&A pages, each backed by a verified catalog tool, opt-out quote verbatim from the summary", () => {
  assert.equal(pages.length, 3);
  for (const p of pages) {
    const t = tools.find((x) => x.domain === p.domain);
    assert.ok(t && t.verified, p.domain);
    if (p.optOutQuote) assert.ok(t.summary.includes(p.optOutQuote), p.slug);
  }
});

test("each page: one H1 question, verdict answer, Last checked date, quote, sources, links, canonical, FAQPage", () => {
  for (const p of pages) {
    const t = tools.find((x) => x.domain === p.domain);
    const h = read(`questions/${p.slug}/index.html`);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, p.slug);
    assert.match(h, new RegExp(`<h1[^>]*>Does ${t.name} train AI on your data\\?</h1>`), p.slug);
    assert.ok(h.includes(`<p class="answer"`) && h.includes(ANSWER[t.compliance_status]), p.slug);
    assert.ok(h.includes(`datetime="${t.last_checked_at.slice(0, 10)}"`) && h.includes("Last checked:"), p.slug);
    assert.ok(h.includes(esc(t.summary)) || h.includes(t.summary), p.slug);
    for (const u of t.source_urls) assert.ok(h.includes(`href="${u}"`), u);
    assert.ok(h.includes(`href="/tools/${t.domain}/"`), p.slug);
    assert.ok(h.includes(`href="/#home-q"`), p.slug);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://getpolicypeek\\.com/questions/${p.slug}/">`));
    assert.match(h, /<meta name="description" content="[^"]+"/);
    assert.ok(h.includes('"@type":"FAQPage"'), p.slug);
  }
});

test("Q&A pages are in the sitemap", () => {
  const sm = readdirSync(dir).filter((f) => f.startsWith("sitemap-") && f !== "sitemap-index.xml").map(read).join("");
  for (const p of pages) assert.ok(sm.includes(`https://getpolicypeek.com/questions/${p.slug}/`), p.slug);
});
