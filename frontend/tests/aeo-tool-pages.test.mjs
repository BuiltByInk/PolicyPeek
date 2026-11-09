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
    assert.ok(h2s.includes(`${t.name} GDPR and AI training`), t.domain);
    assert.match(h, /Used to train models/, t.domain);
    assert.match(h, /Used to provide the feature/, t.domain);
    assert.ok(h.includes(`href="${ICO}"`), `${t.domain}: ICO AI guidance link`);
    assert.match(text(h), /UK GDPR/, t.domain);
    // "How to opt out" only for opt-out verdicts.
    const opt = h2s.some((x) => x.startsWith("How to opt out of"));
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

test("tool titles stay <= 60 chars and ask the question", () => {
  for (const t of tools) {
    const title = decode(read(`tools/${t.domain}/index.html`).match(/<title>([^<]*)<\/title>/)[1]);
    assert.ok(title.length <= 60, `${t.domain}: ${title.length}`);
    if (t.compliance_status !== "not_ai_tool") assert.match(title, /\?|AI training/, t.domain);
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
    assert.deepEqual([...body.urlList].sort(), [...locs].sort());
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
    assert.match(out2, /2 of \d+ sitemap URLs to send \(new or changed/);
    assert.deepEqual(JSON.parse(out2.slice(out2.indexOf("{"))).urlList.sort(), [changed, added].sort());
    const out3 = run("--all");
    assert.equal(JSON.parse(out3.slice(out3.indexOf("{"))).urlList.length, locs.length);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
