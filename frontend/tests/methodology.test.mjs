// /methodology/ fact page and the tool pages' FAQPage JSON-LD (2026-11-04).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(FRONTEND, "..");
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
// Tool pages with a published /questions/ page deliberately carry no FAQPage
// (the Q&A page owns that query; see qa-pages.test.mjs). This test used to
// expect one on every page with a visible FAQ, so it failed on claude.com.
const QA_DOMAINS = new Set(JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, "src/qa.ts"))}); console.log(JSON.stringify(m.PUBLISHED_QA.map((q) => q.domain)));`], { encoding: "utf8" })));
let dist;
const read = (p) => readFileSync(join(dist, p), "utf8");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const v = JSON.parse(m[1]); return Array.isArray(v) ? v : [v]; });

before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-method-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("tool pages: exactly one FAQPage, valid JSON-LD, covering every 'Common questions' Q&A", () => {
  let checked = 0;
  for (const t of tools) {
    const h = read(`tools/${t.domain}/index.html`);
    const faqs = ldBlocks(h).filter((b) => b["@type"] === "FAQPage");
    const sec = h.match(/<section class="tool-faq"[\s\S]*?<\/section>/)?.[0];
    if (!sec) { assert.equal(faqs.length, 0, `${t.domain}: FAQPage without a visible section`); continue; }
    if (QA_DOMAINS.has(t.domain)) { assert.equal(faqs.length, 0, `${t.domain}: its /questions/ page carries the FAQPage`); continue; }
    assert.equal(faqs.length, 1, t.domain);
    const f = faqs[0];
    assert.equal(f["@context"], "https://schema.org");
    const qs = new Map(f.mainEntity.map((q) => { assert.equal(q["@type"], "Question"); assert.equal(q.acceptedAnswer["@type"], "Answer"); assert.ok(q.acceptedAnswer.text.trim()); return [q.name, q.acceptedAnswer.text]; }));
    const pairs = [...sec.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => [decode(m[1]), decode(m[2])]);
    assert.ok(pairs.length >= 2, t.domain);
    for (const [q, a] of pairs) assert.equal(qs.get(q), a, `${t.domain}: "${q}" in FAQPage with the same answer`);
    assert.ok(qs.has(decode(h.match(/<h1[^>]*>([^<]*)<\/h1>/)[1])), `${t.domain}: the H1 question leads the FAQPage`);
    checked++;
  }
  assert.ok(checked >= 40, `checked ${checked} tool pages`);
});

test("/methodology/: title <= 60, description <= 160, one H1, canonical, required sections", () => {
  const h = read("methodology/index.html");
  const title = decode(h.match(/<title>([^<]*)<\/title>/)[1]);
  const desc = decode(h.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.ok(title.length <= 60, title);
  assert.ok(desc.length <= 160, desc);
  assert.equal((h.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(h, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/methodology\/">/);
  for (const id of ["what", "how", "recheck", "free", "not-legal-advice"]) assert.match(h, new RegExp(`id="${id}"`), id);
  const text = decode(h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.match(text, /AI extraction/);
  assert.match(text, /Fixed rules/);
  assert.match(text, /Human review/);
  assert.match(text, /isn't legal advice/);
  assert.doesNotMatch(text, /\bCompliant\b/);
  assert.ok(ldBlocks(h).length >= 1);
});

test("/methodology/ recheck numbers match the backend cron and wrangler schedule", () => {
  const cron = readFileSync(join(REPO, "backend/src/cron.ts"), "utf8");
  const days = +cron.match(/RECHECK_AFTER_DAYS = (\d+)/)[1];
  const per = +cron.match(/MAX_RECHECKS_PER_RUN = (\d+)/)[1];
  assert.match(readFileSync(join(REPO, "backend/wrangler.toml"), "utf8"), /crons = \[[^\]]*"0 4 \* \* \*"/);
  const text = decode(read("methodology/index.html").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  assert.match(text, new RegExp(`Once a day, PolicyPeek rechecks up to ${per} published tools whose verdict was last confirmed more than ${days} days ago`));
  assert.match(readFileSync(join(REPO, "backend/src/extraction.ts"), "utf8"), /claude-haiku/);
});

test("/methodology/ is in the sitemap and linked from the footer and /about/", () => {
  const sm = read("sitemap-0.xml");
  assert.match(sm, /<loc>https:\/\/getpolicypeek\.com\/methodology\/<\/loc><lastmod>/);
  for (const p of ["index.html", "tools/index.html", "about/index.html"]) assert.match(read(p), /<footer[\s\S]*href="\/methodology\/"/, p);
  assert.match(read("about/index.html"), /<main[\s\S]*href="\/methodology\/"[\s\S]*<\/main>/);
});
