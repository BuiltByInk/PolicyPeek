// SEO health check (2026-11-04): tool H1s, per-tool summaries and related
// links, sitemap <lastmod>, guide <title> length, answer-before-boilerplate on
// guides, and the /tools/ canonical + ?v= filter values.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
let dist;
const read = (p) => readFileSync(join(dist, p), "utf8");
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const guideSlugs = () => readdirSync(join(FRONTEND, "src/guides")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));

before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-seo-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("tool pages: H1 is 'Does <name> train on your data?' (not-an-AI-tool keeps its name)", () => {
  for (const t of tools) {
    const h = read(`tools/${t.domain}/index.html`);
    const h1s = [...h.matchAll(/<h1[^>]*>([^<]*)<\/h1>/g)].map((m) => decode(m[1]));
    assert.equal(h1s.length, 1, t.domain);
    const want = t.compliance_status === "not_ai_tool" ? t.name : `Does ${t.name} train on your data?`;
    assert.equal(h1s[0], want, t.domain);
  }
});

test("tool pages: unique summary from the tool's own data, and 3-5 related tool links", () => {
  const seen = new Map();
  for (const t of tools) {
    const h = read(`tools/${t.domain}/index.html`);
    const m = h.match(/<p class="tool-summary"[^>]*>([^<]*)<\/p>/);
    if (t.compliance_status === "not_ai_tool") { assert.equal(m, null, t.domain); continue; }
    assert.ok(m, `${t.domain} has a summary`);
    const s = decode(m[1]);
    assert.ok(s.includes(t.name), `${t.domain} summary names the tool`);
    assert.doesNotMatch(s, /\bcompliant\b/i, t.domain);
    assert.ok(!seen.has(s), `${t.domain} summary duplicates ${seen.get(s)}`);
    seen.set(s, t.domain);
    const rel = h.match(/class="related"[\s\S]*?<\/section>/)[0];
    const links = (rel.match(/href="\/tools\/[^"]+\/"/g) || []);
    assert.ok(links.length >= 3 && links.length <= 5, `${t.domain}: ${links.length} related links`);
    assert.ok(!links.includes(`href="/tools/${t.domain}/"`), `${t.domain} links itself`);
  }
  // Priority pages from the health check. (Descript was also named, but it has
  // no page: it isn't in data/tools.json.)
  for (const d of ["meshy.ai", "kimi.com", "invideo.io", "elevenlabs.io", "bolt.new"]) {
    assert.ok([...seen.values()].includes(d), `priority page ${d} has a summary`);
  }
});

test("sitemap: every URL has a real <lastmod>; tools use last_checked_at, not_ai_tool stays out", () => {
  const xml = read("sitemap-0.xml");
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.ok(urls.length > 50);
  for (const u of urls) {
    const lm = u.match(/<lastmod>([^<]+)<\/lastmod>/);
    assert.ok(lm, `lastmod on ${u}`);
    assert.ok(!Number.isNaN(new Date(lm[1]).getTime()), `valid lastmod on ${u}`);
  }
  for (const t of tools) {
    const loc = `<loc>https://getpolicypeek.com/tools/${t.domain}/</loc>`;
    if (t.compliance_status === "not_ai_tool") { assert.ok(!xml.includes(loc), t.domain); continue; }
    assert.ok(xml.includes(`${loc}<lastmod>${new Date(t.last_checked_at).toISOString()}</lastmod>`), t.domain);
  }
  for (const s of guideSlugs()) {
    const h = read(`guides/${s}/index.html`);
    const modified = h.match(/"dateModified":"(\d{4}-\d{2}-\d{2})"/)[1];
    assert.ok(xml.includes(`<loc>https://getpolicypeek.com/guides/${s}/</loc><lastmod>${modified}T00:00:00.000Z</lastmod>`), s);
  }
});

test("guides: <title> is 60 characters or fewer including ' · PolicyPeek'", () => {
  for (const s of guideSlugs()) {
    const title = decode(read(`guides/${s}/index.html`).match(/<title>([^<]*)<\/title>/)[1]);
    assert.ok(title.endsWith(" · PolicyPeek"), s);
    assert.ok(title.length <= 60, `${s}: ${title.length} chars: ${title}`);
  }
});

test("guides: the answer comes before the 'Last checked … Not legal advice' boilerplate", () => {
  for (const s of guideSlugs()) {
    const md = readFileSync(join(FRONTEND, "src/guides", `${s}.md`), "utf8").split("\n");
    assert.ok(md[0].startsWith("# "), s);
    const firstPara = md.slice(1).find((l) => l.trim());
    assert.doesNotMatch(firstPara, /^\*Last checked:/, `${s}: first paragraph is boilerplate`);
    const html = read(`guides/${s}/index.html`);
    const article = html.slice(html.indexOf('<article class="guide"'));
    const paras = [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]).filter((p) => !/class="byline"/.test(p));
    const firstBody = paras.findIndex((p) => !/^By <a/.test(p));
    const bp = paras.findIndex((p) => /Last checked:/.test(p));
    assert.ok(bp > firstBody, `${s}: boilerplate at ${bp}, answer at ${firstBody}`);
  }
});

test("/tools/: canonical is /tools/ for ?v= filter URLs, and no ?v= value says 'compliant'", () => {
  const t = read("tools/index.html");
  // Static page: the same HTML is served for every ?v=…, so its canonical is
  // what every filter URL gets.
  assert.match(t, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/tools\/">/);
  assert.doesNotMatch(t, /<meta name="robots" content="noindex/);
  const all = readdirSync(dist, { recursive: true }).filter((f) => f.endsWith(".html")).map((f) => read(f)).join("\n");
  const vs = [...all.matchAll(/\?v=([^"&#\s]+)/g)].map((m) => m[1]);
  assert.ok(vs.length >= 6);
  for (const v of vs) assert.doesNotMatch(v, /compliant/, v);
  for (const slug of ["doesnt-train", "opt-out", "no-opt-out", "unclear", "company-wide", "not-ai-tool"]) {
    assert.match(t, new RegExp(`data-slug="${slug}"`));
  }
});
