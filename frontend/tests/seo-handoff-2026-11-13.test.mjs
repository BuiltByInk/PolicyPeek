// Task 5/6 (13 Nov 2026): category hubs, /changes/, alias redirects,
// title/description format, "may" wording, canonicals, related+hub links.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const changes = JSON.parse(readFileSync(join(FRONTEND, "data/policy-changes.json"), "utf8"));
const categoriesSrc = readFileSync(join(FRONTEND, "src/categories.ts"), "utf8");
const slugs = [...categoriesSrc.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

test("/changes/ data is only real records (none invented on this branch)", () => {
  assert.deepEqual(changes, []);
});

let dist;
const read = (p) => readFileSync(join(dist, p), "utf8");

before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-handoff-seo-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("category hubs list only existing catalog tools and badges, and are in the sitemap", () => {
  const index = read("categories/index.html");
  assert.match(index, /<h1[^>]*>AI tool categories<\/h1>/);
  assert.match(index, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/categories\/">/);
  const xml = read("sitemap-0.xml");
  assert.ok(slugs.length >= 7, slugs.join(","));
  for (const slug of slugs) {
    const h = read(`categories/${slug}/index.html`);
    assert.match(h, /This page adds no new claims/);
    assert.doesNotMatch(h, /InkLLM|checkout|buy now|upgrade to/i);
    assert.match(h, /href="\/tools\/[^"]+\/"/);
    assert.match(xml, new RegExp(`<loc>https://getpolicypeek.com/categories/${slug}/</loc>`));
  }
});

test("/changes/ is empty, has RSS, and does not invent entries", () => {
  const h = read("changes/index.html");
  assert.match(h, /<h1[^>]*>Policy changes<\/h1>/);
  assert.match(h, /No published policy changes yet/);
  assert.match(h, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/changes\/">/);
  assert.doesNotMatch(h, /caught|quietly|scandal/i);
  const rss = read("changes/rss.xml");
  assert.match(rss, /<title>PolicyPeek policy changes<\/title>/);
  assert.doesNotMatch(rss, /<item>/);
});

test("tool pages: 3–5 related links, a category hub link, canonical with no www and a trailing slash, WebPage dateModified, checked-date title", () => {
  for (const t of tools.filter((x) => x.compliance_status !== "not_ai_tool")) {
    const h = read(`tools/${t.domain}/index.html`);
    const title = decode(h.match(/<title>([^<]*)<\/title>/)[1]);
    assert.match(title, /Does .+\? \(checked [A-Z][a-z]+ 20\d{2}\) · PolicyPeek/);
    const esc = t.domain.replace(/\./g, "\\.");
    assert.match(h, new RegExp(`<link rel="canonical" href="https://getpolicypeek.com/tools/${esc}/">`));
    assert.doesNotMatch(h, /www\.getpolicypeek/);
    const rel = h.match(/class="related"[\s\S]*?<\/section>/)[0];
    const links = rel.match(/href="\/tools\/[^"]+\/"/g) || [];
    assert.ok(links.length >= 3 && links.length <= 5, `${t.domain}: ${links.length}`);
    assert.match(rel, /href="\/categories\/[a-z0-9-]+\//);
    if (t.last_checked_at) {
      assert.match(h, new RegExp(`"dateModified":"${new Date(t.last_checked_at).toISOString()}"`));
    }
    assert.doesNotMatch(h, /InkLLM|Gumroad checkout|buy the pack/i);
  }
});

test("Photoroom (no 'may' in the stored quote) does not say 'may train'; ChatGPT (which uses 'may') does", () => {
  const extract = (d) => decode(read(`tools/${d}/index.html`).match(/class="answer"[^>]*>([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, ""));
  const photo = extract("photoroom.com");
  const gpt = extract("openai.com");
  assert.match(photo, /trains on your data/);
  assert.doesNotMatch(photo, /may train on your data/);
  assert.match(gpt, /may train on your data/);
});

test("_redirects maps chatgpt.com, claude.ai and gemini aliases to existing cards, and sitemap.xml to the index", () => {
  const r = readFileSync(join(FRONTEND, "public/_redirects"), "utf8");
  assert.match(r, /\/tools\/chatgpt\.com\/?\s+\/tools\/openai\.com\/\s+301/);
  assert.match(r, /\/tools\/claude\.ai\/?\s+\/tools\/claude\.com\/\s+301/);
  assert.match(r, /\/tools\/gemini\/?\s+\/tools\/google\.com\/\s+301/);
  assert.match(r, /\/sitemap\.xml\s+\/sitemap-index\.xml\s+301/);
});
