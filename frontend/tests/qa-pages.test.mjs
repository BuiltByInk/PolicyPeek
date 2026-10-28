// Static checks on the dated Q&A pages (/questions/<slug>/) and their index:
// every quote is word for word from its saved source snapshot or the catalog,
// the verdict/answer matches the catalog, structure (plan table, retention,
// opt-out, UK/GDPR, changelog, Last checked), JSON-LD, cross-links with
// /tools/, drafts excluded everywhere, sitemap, llms.txt and robots.txt.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(FRONTEND, "..");
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const { QA_PAGES, NOT_STATED } = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, "src/qa.ts"))}); console.log(JSON.stringify({ QA_PAGES: m.QA_PAGES, NOT_STATED: m.NOT_STATED }));`], { encoding: "utf8" }));
const published = QA_PAGES.filter((q) => !q.draft);
const drafts = QA_PAGES.filter((q) => q.draft);
const tool = (d) => tools.find((t) => t.domain === d);
// Snapshots are tag-stripped page text; compare with whitespace collapsed and
// no space before punctuation, and typographic quotes folded to ASCII.
const norm = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").replace(/ ([.,:;)])/g, "$1").trim();
const ANSWER = { compliant: "No: ", compliant_with_caveats: "Yes, by default: ", not_compliant: "Yes: " };
let dir;
const read = (p) => readFileSync(join(dir, p), "utf8");
const words = (h) => (h.match(/<main[\s\S]*?<\/main>/)?.[0] ?? h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-qa-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));

test("every published page: verified catalog tool, every quote word for word from its snapshot or the catalog", () => {
  assert.ok(published.length >= 2);
  for (const q of published) {
    const t = tool(q.domain);
    assert.ok(t && t.verified, q.domain);
    const snaps = Object.fromEntries(q.sources.map((s) => {
      assert.match(s.fetched, /^\d{4}-\d{2}-\d{2}$/, s.id);
      assert.ok(existsSync(join(REPO, s.snapshot)), s.snapshot);
      return [s.id, norm(readFileSync(join(REPO, s.snapshot), "utf8"))];
    }));
    const quotes = [...q.plans.flatMap((p) => [p.training, p.retention]), ...q.dataUsed, ...q.retention, ...q.optOutSteps, ...q.optOutCaveats, ...q.gdpr].filter(Boolean);
    assert.ok(quotes.length >= 6, q.slug);
    for (const { text, src } of quotes) {
      if (src === "catalog") assert.ok(norm(`${t.summary} ${t.data_retention ?? ""}`).includes(norm(text)), `${q.slug}: not in catalog: ${text}`);
      else assert.ok(snaps[src]?.includes(norm(text)), `${q.slug}: not in ${src}: ${text}`);
    }
    if (t.compliance_status === "compliant_with_caveats") assert.ok(q.optOutSteps.length > 0, `${q.slug}: caveats needs opt-out steps`);
    assert.ok(q.changelog.length > 0, q.slug);
  }
});

test("each page: title, one H1, one-sentence answer first, Last checked, sections, 600-900 words, links, canonical", () => {
  for (const q of published) {
    const t = tool(q.domain);
    const h = read(`questions/${q.slug}/index.html`);
    assert.match(h, new RegExp(`<title>Does ${t.name} train on your data\\? \\(Checked [A-Z][a-z]{2} \\d{4}\\)`), q.slug);
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, q.slug);
    assert.match(h, new RegExp(`<h1[^>]*>Does ${t.name} train on your data\\?</h1>\\s*<p class="answer"[^>]*>${ANSWER[t.compliance_status].replace(/[.?()]/g, "\\$&")}`), q.slug);
    assert.ok(h.includes(`datetime="${t.last_checked_at.slice(0, 10)}"`) && h.includes("Last checked:"), q.slug);
    for (const s of ["By plan", "What data is used", "How to opt out of AI training", "UK and GDPR", "Sources", "Changelog"])
      assert.ok(h.includes(`>${s}</h2>`), `${q.slug}: ${s}`);
    assert.match(h, /<h2[^>]*>How long it(&#39;|')s kept<\/h2>/, q.slug);
    assert.match(h, /<table[\s>][\s\S]*<th scope="col"[^>]*>Plan<\/th>/, q.slug);
    const n = words(h);
    assert.ok(n >= 600 && n <= 900, `${q.slug}: ${n} words`);
    for (const s of q.sources) assert.ok(h.includes(`href="${s.url}"`), s.url);
    assert.ok(h.includes(`href="/tools/${t.domain}/"`) && h.includes(`href="/#home-q"`) && h.includes(`href="/questions/"`), q.slug);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://getpolicypeek\\.com/questions/${q.slug}/">`));
    assert.match(h, /<meta name="description" content="[^"]{50,}"/);
  }
});

test("JSON-LD: FAQPage with the 4 questions and dateModified, Article published by PolicyPeek, breadcrumbs", () => {
  for (const q of published) {
    const t = tool(q.domain);
    const ld = [...read(`questions/${q.slug}/index.html`).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());
    const faq = ld.find((x) => x["@type"] === "FAQPage");
    assert.ok(faq?.dateModified, q.slug);
    const names = faq.mainEntity.map((e) => e.name);
    for (const n of [`Does ${t.name} train on my data?`, `Does ${t.name} use my data for AI?`, `How do I opt out of ${t.name} AI training?`, `Is ${t.name} GDPR compliant?`]) assert.ok(names.includes(n), n);
    const art = ld.find((x) => x["@type"] === "Article");
    assert.equal(art?.publisher?.name, "PolicyPeek");
    assert.ok(art.dateModified, q.slug);
    assert.ok(ld.some((x) => x["@type"] === "BreadcrumbList"), q.slug);
  }
});

test("/tools/ pages link to their Q&A page, drop the competing FAQPage/title, and keep self-canonicals", () => {
  for (const q of published) {
    const t = tool(q.domain);
    const h = read(`tools/${t.domain}/index.html`);
    assert.ok(h.includes(`href="/questions/${q.slug}/"`), t.domain);
    assert.ok(!h.includes('"@type":"FAQPage"'), t.domain);
    assert.ok(!/<title>Does /.test(h), t.domain);
    assert.match(h, new RegExp(`<link rel="canonical" href="https://getpolicypeek\\.com/tools/${t.domain.replace(/\./g, "\\.")}/">`));
  }
});

test("/questions/ index lists every published page and no drafts", () => {
  const h = read("questions/index.html");
  assert.match(h, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/questions\/">/);
  for (const q of published) assert.ok(h.includes(`href="/questions/${q.slug}/"`), q.slug);
  for (const q of drafts) assert.ok(!h.includes(q.slug), q.slug);
});

test("drafts are not built; sitemap and llms.txt cover published pages only", () => {
  const sm = readdirSync(dir).filter((f) => f.startsWith("sitemap-") && f !== "sitemap-index.xml").map(read).join("");
  const llms = read("llms.txt");
  assert.ok(sm.includes("https://getpolicypeek.com/questions/</loc>") && llms.includes("https://getpolicypeek.com/questions/)"));
  for (const q of published) {
    assert.ok(sm.includes(`https://getpolicypeek.com/questions/${q.slug}/`), q.slug);
    assert.ok(llms.includes(`https://getpolicypeek.com/questions/${q.slug}/`), q.slug);
  }
  for (const q of drafts) {
    assert.ok(!existsSync(join(dir, `questions/${q.slug}`)), q.slug);
    assert.ok(!sm.includes(q.slug) && !llms.includes(q.slug), q.slug);
  }
});

test("robots.txt: AI training crawlers blocked, AI search bots and search engines allowed, sitemap listed", () => {
  const r = read("robots.txt");
  const groups = r.split(/\n\s*\n/).map((g) => ({ agents: [...g.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1].trim()), rule: g.match(/^(Allow|Disallow): (.+)$/m)?.slice(1).join(" ") }));
  const ruleFor = (a) => groups.find((g) => g.agents.includes(a))?.rule;
  for (const a of ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot", "Applebot-Extended", "meta-externalagent"]) assert.equal(ruleFor(a), "Disallow /", a);
  for (const a of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "Claude-SearchBot", "Googlebot", "Bingbot", "*"]) assert.equal(ruleFor(a), "Allow /", a);
  assert.match(r, /^Sitemap: https:\/\/getpolicypeek\.com\/sitemap-index\.xml$/m);
});
