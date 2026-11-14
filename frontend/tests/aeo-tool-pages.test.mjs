// Answer-engine layout on /tools/<domain>/ (AEO, 2026-11-09) and the IndexNow
// key file + ping script. Builds its own dist.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(FRONTEND, "..");
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (h) => decode(h.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const v = JSON.parse(m[1]); return Array.isArray(v) ? v : [v]; });
const QA_DOMAINS = new Set(JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, "src/qa.ts"))}); console.log(JSON.stringify(m.PUBLISHED_QA.map((q) => q.domain)));`], { encoding: "utf8" })));
const ICO = "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/";

// Fixed answer wording per status (toolAnswer.ts). With a stored quote the
// line may say "<Tool>'s published policy says"; without one it must not.
const LEAD = {
  compliant: "No.", compliant_with_caveats: "Yes, by default", not_compliant: "Yes",
  unrated: "We can't tell.", shared_domain_unverified: "We can't say yet.", not_ai_tool: "Not applicable.",
};

let dist;
const read = (p) => readFileSync(join(dist, p), "utf8");
before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-aeo-test-"));
  const env = { ...process.env }; delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("answer line: fixed wording per status, then 'As of <last checked>' and the official source link", () => {
  const seen = new Set();
  for (const t of tools) {
    const h = read(`tools/${t.domain}/index.html`);
    const m = h.match(/<p class="answer"[^>]*>([\s\S]*?)<\/p>/);
    assert.ok(m, `${t.domain}: answer line`);
    const a = text(m[1]);
    assert.ok(a.startsWith(LEAD[t.compliance_status]), `${t.domain}: "${a}"`);
    if (!(t.summary && t.summary.trim())) assert.doesNotMatch(a, /policy says/, `${t.domain}: no quote, no "says"`);
    assert.doesNotMatch(a, /\bcompliant\b/i, t.domain);
    if (t.last_checked_at) {
      const d = new Date(t.last_checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      assert.ok(a.includes(`As of ${d}.`), `${t.domain}: as-of date`);
    }
    const src = t.source_urls.find((u) => /^https?:/.test(u));
    if (src) assert.ok(m[1].includes(`href="${new URL(src).href}"`), `${t.domain}: source link in the answer line`);
    seen.add(t.compliance_status);
  }
  for (const s of ["compliant", "compliant_with_caveats", "not_compliant", "unrated", "shared_domain_unverified", "not_ai_tool"]) assert.ok(seen.has(s), `catalog covers ${s}`);
});

test("the H1 question's FAQPage answer is the visible answer line, word for word", () => {
  for (const t of tools) {
    if (t.compliance_status === "not_ai_tool" || QA_DOMAINS.has(t.domain)) continue;
    const h = read(`tools/${t.domain}/index.html`);
    const faqs = ldBlocks(h).filter((b) => b["@type"] === "FAQPage");
    assert.equal(faqs.length, 1, t.domain);
    const h1 = decode(h.match(/<h1[^>]*>([^<]*)<\/h1>/)[1]);
    const q = faqs[0].mainEntity.find((x) => x.name === h1);
    assert.ok(q, `${t.domain}: H1 question in FAQPage`);
    assert.equal(q.acceptedAnswer.text, text(h.match(/<p class="answer"[^>]*>([\s\S]*?)<\/p>/)[1]), t.domain);
  }
});

test("question-style H2s, train-vs-provide section, GDPR section with the ICO link", () => {
  for (const t of tools) {
    const h = read(`tools/${t.domain}/index.html`);
    const h2s = [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1]));
    if (t.compliance_status === "not_ai_tool") { assert.ok(!h2s.includes(`Does ${t.name} train on my data?`), t.domain); continue; }
    assert.ok(h2s.includes(`Does ${t.name} train on my data?`), `${t.domain}: ${h2s}`);
    assert.ok(h2s.includes(`Is ${t.name} safe for UK GDPR?`), t.domain);
    assert.match(h, /Used to train models/, t.domain);
    assert.match(h, /Used to provide the feature/, t.domain);
    assert.ok(h.includes(`href="${ICO}"`), `${t.domain}: ICO AI guidance link`);
    assert.match(text(h), /UK GDPR/, t.domain);
    // "Can I opt out …?" only for opt-out verdicts.
    const opt = h2s.some((x) => x.startsWith("Can I opt out of") && x.endsWith("?"));
    assert.equal(opt, t.compliance_status === "compliant_with_caveats", `${t.domain}: opt-out section`);
  }
});

test("quotes shown in the new sections are cut verbatim from the catalog summary", () => {
  for (const t of tools) {
    if (t.compliance_status === "not_ai_tool" || !t.summary) continue;
    const h = read(`tools/${t.domain}/index.html`);
    for (const m of h.matchAll(/<section class="aeo"[\s\S]*?<\/section>/g)) {
      for (const bq of m[0].matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g)) {
        for (const p of bq[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)) assert.ok(t.summary.includes(decode(p[1])), `${t.domain}: "${decode(p[1]).slice(0, 60)}"`);
      }
    }
  }
});

test("no plan table on tool pages (the catalog has no per-plan fields)", () => {
  assert.ok(!tools.some((t) => Object.keys(t).some((k) => /plan|tier/i.test(k))), "tools.json gained a per-plan field: render it");
  for (const t of tools) assert.doesNotMatch(read(`tools/${t.domain}/index.html`), /<table/, t.domain);
});

test("tool titles ask the question and include the last-checked month", () => {
  for (const t of tools) {
    const title = decode(read(`tools/${t.domain}/index.html`).match(/<title>([^<]*)<\/title>/)[1]);
    assert.ok(title.endsWith(" · PolicyPeek"), t.domain);
    if (t.compliance_status === "not_ai_tool") {
      assert.match(title, /not an AI tool/, t.domain);
    } else {
      assert.match(title, /Does .+\? \(checked [A-Z][a-z]+ 20\d{2}\) · PolicyPeek/, t.domain);
    }
  }
});

test("home page answers 'Which AI tools don't train on your data?' from the catalog", () => {
  const h = read("index.html");
  const sec = h.match(/<section class="no-train"[\s\S]*?<\/section>/)?.[0];
  assert.ok(sec);
  assert.match(sec, /<h2[^>]*>Which AI tools don(&#39;|')t train on your data\?<\/h2>/);
  const green = tools.filter((t) => t.compliance_status === "compliant");
  for (const t of green) assert.ok(sec.includes(`href="/tools/${t.domain}/"`), t.domain);
  assert.equal((sec.match(/href="\/tools\//g) || []).length, green.length);
  assert.ok(sec.includes('href="/guides/ai-tools-that-dont-train-on-your-data-uk/"'));
});

test("IndexNow key file is served at the site root and holds its own key", () => {
  const keys = readdirSync(dist).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(keys.length, 1);
  assert.equal(readFileSync(join(dist, keys[0]), "utf8").trim(), keys[0].slice(0, 32));
  // Pages serves *.txt as static files (not via Functions).
  assert.ok(JSON.parse(readFileSync(join(FRONTEND, "public/_routes.json"), "utf8")).exclude.includes("/*.txt"));
});

test("indexnow-ping --dry-run: payload shape, first run = all sitemap URLs, changed-only after, nothing written", () => {
  const tmp = mkdtempSync(join(tmpdir(), "pp-indexnow-"));
  try {
    const state = join(tmp, "state.json");
    const run = (...a) => execFileSync(process.execPath, [join(REPO, "scripts/indexnow-ping.mjs"), "--dry-run", "--dist", dist, "--state", state, ...a], { encoding: "utf8" });
    const out = run();
    assert.match(out, /DRY RUN: nothing sent to https:\/\/api\.indexnow\.org\/indexnow/);
    assert.match(out, /first run/);
    const body = JSON.parse(out.slice(out.indexOf("{")));
    const key = readdirSync(dist).find((f) => /^[0-9a-f]{32}\.txt$/.test(f)).slice(0, 32);
    assert.equal(body.host, "getpolicypeek.com");
    assert.equal(body.key, key);
    assert.equal(body.keyLocation, `https://getpolicypeek.com/${key}.txt`);
    const sitemap = readFileSync(join(dist, "sitemap-0.xml"), "utf8");
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const sitemapPing = ["https://getpolicypeek.com/sitemap-index.xml", "https://getpolicypeek.com/sitemap.xml"];
    assert.deepEqual([...body.urlList].sort(), [...locs, ...sitemapPing].sort());
    assert.ok(sitemapPing.every((u) => body.urlList.includes(u)), "canonical sitemap URLs are always submitted with a ping");
    assert.ok(!body.urlList.includes("https://getpolicypeek.com/sitemap-0.xml"), "do not submit the Astro chunk as the sitemap");
    assert.ok(!body.urlList.some((u) => /hancocyber/.test(u)), "noindex pages are not sent");
    assert.equal(existsSync(state), false, "dry run writes no state");
    // Simulate a previous send where one page differed and one page is new.
    const prev = Object.fromEntries(locs.map((u) => [u, "x"]));
    const fp = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
      `const m = await import(${JSON.stringify(join(REPO, "scripts/indexnow-ping.mjs"))}); const e = await m.readSitemapUrls(${JSON.stringify(join(dist, "sitemap-index.xml"))}, { dist: ${JSON.stringify(dist)} }); console.log(JSON.stringify(m.fingerprints(e, ${JSON.stringify(dist)})));`], { encoding: "utf8" }));
    for (const u of locs) prev[u] = fp[u];
    const changed = "https://getpolicypeek.com/tools/notion.com/", added = "https://getpolicypeek.com/tools/zapier.com/";
    prev[changed] = "sha256:old"; delete prev[added];
    writeFileSync(state, JSON.stringify(prev));
    const out2 = run();
    assert.match(out2, /2 of \d+ page URLs to send \(new or changed/);
    assert.deepEqual(JSON.parse(out2.slice(out2.indexOf("{"))).urlList.sort(), [changed, added, ...sitemapPing].sort());
    const out3 = run("--all");
    assert.equal(JSON.parse(out3.slice(out3.indexOf("{"))).urlList.length, locs.length + sitemapPing.length);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// Slack AI wording (9 Nov 2026, steward-approved; see toolOverrides.ts and
// data-updates/2026-11-09-slack-wording/).
const SLACK_ANSWER = "Yes, by default, for recommendation features only. Slack says it analyses your messages, content and files to train its non-generative recommendation models (like emoji and channel suggestions) unless a workspace owner opts out. It says it doesn't train generative AI or LLMs on your data unless you opt in.";
const SLACK_Q = "Can I stop Slack AI training on my data?";
const SLACK_A = "Yes, but only a workspace owner can. They email feedback@slack.com to opt the workspace out of Slack's global recommendation models. Generative AI training only happens if your organisation opts in.";
const SLACK_NEW_QUOTES = [
  ["slack-privacy-principles.txt", "Slack aggregates and disassociates Customer Data such that Slack's use of Customer Data to update the Services will never identify any of our customers or individuals as the source of any of these improvements to any third party, other than to Slack's affiliates or sub-processors."],
  ["slack-security-for-ai-features.txt", "Customer data never leaves Slack-controlled infrastructure and is never used to train large language models (LLMs)."],
];

test("Slack AI: badge unchanged, approved answer and FAQ on the page and in the one FAQPage", () => {
  const t = tools.find((x) => x.domain === "slack.com");
  assert.equal(t.compliance_status, "compliant_with_caveats");
  const h = read("tools/slack.com/index.html");
  assert.ok(text(h.match(/<p class="answer"[^>]*>([\s\S]*?)<\/p>/)[1]).startsWith(SLACK_ANSWER));
  const faqs = ldBlocks(h).filter((b) => b["@type"] === "FAQPage");
  assert.equal(faqs.length, 1);
  const qs = new Map(faqs[0].mainEntity.map((q) => [q.name, q.acceptedAnswer.text]));
  assert.ok(qs.get("Does Slack AI train on your data?").startsWith(SLACK_ANSWER));
  assert.equal(qs.get(SLACK_Q), SLACK_A);
  const sec = h.match(/<section class="tool-faq"[\s\S]*?<\/section>/)[0];
  const pairs = new Map([...sec.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => [decode(m[1]), decode(m[2])]));
  assert.equal(pairs.get(SLACK_Q), SLACK_A);
  assert.equal([...pairs.keys()].filter((q) => q === SLACK_Q).length, 1);
  assert.ok(h.includes(`badge`) && /Trains by default, you can opt out/.test(h));
});

test("Slack AI: the four existing quotes are kept, the two new ones match the saved live pages word for word", () => {
  const t = tools.find((x) => x.domain === "slack.com");
  const norm = (s) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();
  for (const q of [
    "We do not develop generative AI models using Customer Data.",
    "If you want to exclude your Customer Data from helping to train Slack global models, you can opt out.",
    "contact our Customer Experience team at feedback@slack.com",
    "Slack will not use Customer Data to train generative AI models unless Customer provides affirmative opt-in consent.",
  ]) assert.ok(t.summary.includes(q), q);
  const snap = join(REPO, "research/qa-sources/2026-11-09-slack");
  for (const [f, q] of SLACK_NEW_QUOTES) {
    assert.ok(t.summary.includes(`"${q}"`), q.slice(0, 40));
    assert.ok(norm(readFileSync(join(snap, f), "utf8")).includes(norm(q)), `${f}: ${q.slice(0, 40)}`);
  }
  assert.ok(t.source_urls.includes("https://slack.com/intl/en-gb/help/articles/28310650165907-Security-for-AI-features-in-Slack"));
  assert.ok(t.source_urls.includes("https://slack.com/intl/en-gb/trust/data-management/privacy-principles"));
});
