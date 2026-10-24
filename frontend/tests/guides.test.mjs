// Static checks on the /guides/ section: one H1, canonical, Article + FAQPage
// JSON-LD, plain tables, Markdown copies, llms.txt, sitemap and internal links.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(FRONTEND, "src/guides");
const slugs = readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
let dir;
const read = (p) => readFileSync(join(dir, p), "utf8");

before(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-guides-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));

test("every guide: one H1, canonical on the apex, Markdown alternate, Article + FAQPage JSON-LD, plain tables", () => {
  assert.ok(slugs.length >= 7);
  for (const s of slugs) {
    const h = read(`guides/${s}/index.html`);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, s);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://getpolicypeek\\.com/guides/${s}/">`), s);
    assert.match(h, new RegExp(`<link rel="alternate" type="text/markdown" href="https://getpolicypeek\\.com/guides/${s}\\.md">`), s);
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
    const article = ld.find((x) => x["@type"] === "Article");
    const faq = ld.find((x) => x["@type"] === "FAQPage");
    assert.ok(article && faq, `${s}: Article + FAQPage`);
    assert.equal(article.mainEntityOfPage, `https://getpolicypeek.com/guides/${s}/`);
    assert.ok(faq.mainEntity.length >= 3, `${s}: FAQ entries`);
    for (const q of faq.mainEntity) {
      // Compare letters/digits only: Astro's smart punctuation curls quotes in the HTML.
      const norm = (x) => x.replace(/&[#a-z0-9]+;/gi, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
      assert.ok(norm(h).includes(norm(q.name)), `${s}: FAQ question visible in HTML: ${q.name}`);
      assert.doesNotMatch(q.acceptedAnswer.text, /\]\(|https?:/, `${s}: FAQ answer is plain text`);
    }
    if (h.includes("<table")) assert.match(h, /<thead>/, s);
    assert.doesNotMatch(h, /www\.getpolicypeek\.com/, s);
  }
});

test("Markdown copies are served at /guides/<slug>.md, identical to the source", () => {
  for (const s of slugs) {
    assert.equal(read(`guides/${s}.md`), readFileSync(join(SRC, `${s}.md`), "utf8"), s);
  }
});

test("guide content: no unlabelled Mailchimp inference, no www links", () => {
  for (const s of slugs) {
    const md = readFileSync(join(SRC, `${s}.md`), "utf8");
    assert.doesNotMatch(md, /contacts' details/, s);
    assert.doesNotMatch(md, /www\.getpolicypeek\.com/, s);
  }
});

test("/guides/ index, llms.txt, llms-full.txt and sitemap list every guide", () => {
  const idx = read("guides/index.html");
  const llms = read("llms.txt");
  const full = read("llms-full.txt");
  const sitemap = read("sitemap-0.xml");
  assert.match(llms, /^# PolicyPeek\n/);
  for (const s of slugs) {
    assert.ok(idx.includes(`href="/guides/${s}/"`), `index links ${s}`);
    assert.ok(llms.includes(`https://getpolicypeek.com/guides/${s}.md`), `llms.txt lists ${s}`);
    assert.ok(full.includes(`Source: https://getpolicypeek.com/guides/${s}/`), `llms-full.txt has ${s}`);
    assert.ok(sitemap.includes(`<loc>https://getpolicypeek.com/guides/${s}/</loc>`), `sitemap has ${s}`);
  }
  assert.ok(sitemap.includes("<loc>https://getpolicypeek.com/guides/</loc>"));
});

test("internal links: nav + footer link /guides/, tool pages link the guides that cover them", () => {
  const home = read("index.html");
  assert.match(home, /<nav class="site"[\s\S]*href="\/guides\/"[\s\S]*<\/nav>/);
  assert.match(home, /<footer class="site">[\s\S]*href="\/guides\/"/);
  const otter = read("tools/otter.ai/index.html");
  assert.match(otter, /Guides that cover Otter\.ai/);
  assert.ok(otter.includes('href="/guides/ai-meeting-note-takers-that-dont-train-on-your-data/"'));
  assert.ok(existsSync(join(dir, "tools/openai.com/index.html")));
  assert.ok(read("tools/openai.com/index.html").includes('href="/guides/does-chatgpt-train-on-your-data/"'));
});
