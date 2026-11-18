// Tool-page template v2 (D1, Marketing's best-answer plan, 18 Nov 2026).
// Builds its own dist. Two kinds of check:
//  1. INVARIANTS across every tool page: the verdict, badge label, "Why" line,
//     facts and every quoted policy piece still come straight from the tool's
//     catalog row, so the template change can't alter a card's verdict, badge
//     or quote text.
//  2. The v2 blocks: by-plan table (only where /questions/ data exists),
//     numbered opt-out steps (hidden until Research's R4 data), vendor policy
//     date (hidden until recorded), last-checked age, JSON-LD additions and
//     data-gated FAQ sub-questions.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const firstPub = JSON.parse(readFileSync(join(FRONTEND, "data/first-published.json"), "utf8"));
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const text = (h) => decode(h.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const ldBlocks = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => { const v = JSON.parse(m[1]); return Array.isArray(v) ? v : [v]; });
const ts = (file, expr) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, file))}); console.log(JSON.stringify(${expr}));`], { encoding: "utf8" }));
const { VERDICTS, reasons } = ts("src/verdicts.ts", `{ VERDICTS: m.VERDICTS, reasons: Object.fromEntries(${JSON.stringify(tools)}.map((t) => [t.domain, m.reasonFor(t)])) }`);
const QA = ts("src/qa.ts", "m.PUBLISHED_QA");
const VCLASS = { compliant: "green", compliant_with_caveats: "caveat", not_compliant: "red", unrated: "amber", shared_domain_unverified: "shared", not_ai_tool: "gray" };
const isHttp = (u) => { try { return ["https:", "http:"].includes(new URL(u).protocol); } catch { return false; } };

let dist;
const page = (t) => readFileSync(join(dist, `tools/${t.domain}/index.html`), "utf8");
before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-v2-test-"));
  const env = { ...process.env }; delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("invariant: every card's verdict, badge label, Why line and facts come from its catalog row", () => {
  for (const t of tools) {
    const h = page(t);
    const label = VERDICTS.find((v) => v.status === t.compliance_status).label;
    assert.match(h, new RegExp(`class="verdict v-${VCLASS[t.compliance_status]}"`), `${t.domain}: verdict style`);
    const word = h.match(/<p class="v-word"[^>]*>([\s\S]*?)<\/p>/);
    assert.equal(text(word[1]), `Verdict: ${label}`, `${t.domain}: badge label`);
    if (reasons[t.domain]) assert.equal(text(h.match(/<p class="why-t"[^>]*>([\s\S]*?)<\/p>/)[1]), reasons[t.domain].replace(/\s+/g, " ").trim(), `${t.domain}: Why line`);
    const facts = text(h.match(/<dl class="facts"[^>]*>([\s\S]*?)<\/dl>/)[1].replace(/<\/(dt|dd)>/g, " </$1>"));
    const yn = (v) => (t.compliance_status === "not_ai_tool" && v === null ? "Not applicable" : v === null ? "Unclear from policy" : v ? "Yes" : "No");
    assert.ok(facts.includes(`Trains on user data ${yn(t.trains_on_user_data)}`), `${t.domain}: trains fact`);
    assert.ok(facts.includes(`GDPR mentioned ${yn(t.gdpr_mentioned)}`), `${t.domain}: GDPR fact`);
  }
});

test("invariant: every quoted policy piece on every card is verbatim from the catalog row or the /questions/ data", () => {
  const qaTexts = new Set(QA.flatMap((q) => q.plans.flatMap((p) => [p.training?.text, p.retention?.text]).filter(Boolean)));
  for (const t of tools) {
    const h = page(t);
    for (const bq of h.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g))
      for (const p of bq[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g))
        assert.ok(t.summary.replace(/\s+/g, " ").includes(text(p[1])), `${t.domain}: blockquote piece not in summary: ${text(p[1])}`);
    for (const td of h.matchAll(/<td[^>]*>"([\s\S]*?)" <a class="src"/g)) assert.ok(qaTexts.has(text(td[1])), `${t.domain}: plan cell not from qa.ts: ${text(td[1])}`);
  }
});

test("by-plan table: on exactly the tools with a published /questions/ page, rows copied from it", () => {
  const qaDomains = new Set(QA.map((q) => q.domain));
  for (const t of tools) {
    const h = page(t);
    const table = h.match(/<table class="plans"[\s\S]*?<\/table>/);
    if (!qaDomains.has(t.domain)) { assert.equal(table, null, `${t.domain}: no plan data, so no table`); continue; }
    const q = QA.find((x) => x.domain === t.domain);
    const rows = [...table[0].matchAll(/<tr[^>]*>\s*<th scope="row"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
    assert.deepEqual(rows, q.plans.map((p) => p.plan), `${t.domain}: plan rows`);
  }
});

test("numbered opt-out steps and vendor policy date stay hidden until data is approved", () => {
  // R4 (Research) feeds opt_out_steps; update this test when the first steps are approved.
  for (const t of tools) {
    const h = page(t);
    assert.ok(!h.includes('class="opt-steps"'), `${t.domain}: opt-out steps rendered before R4 data`);
    assert.ok(!h.includes("Policy last updated"), `${t.domain}: policy date rendered without a recorded date`);
  }
});

test("last-checked age is filled in the browser from the same date (no stale build-time age)", () => {
  for (const t of tools.filter((x) => x.last_checked_at)) {
    const day = new Date(t.last_checked_at).toISOString().slice(0, 10);
    const h = page(t);
    assert.ok(new RegExp(`<span class="age" data-age-from="${day}"[^>]*></span>`).test(h), `${t.domain}: empty age span`);
    assert.ok(!/days? ago/.test(text(h.replace(/<script[\s\S]*?<\/script>/g, ""))), `${t.domain}: no baked-in age`);
  }
});

test("JSON-LD: datePublished, isBasedOn and an Organization reviewer only for human-reviewed cards", () => {
  for (const t of tools) {
    const wp = ldBlocks(page(t)).find((b) => b["@type"] === "WebPage");
    assert.equal(wp.datePublished, firstPub[t.domain], `${t.domain}: datePublished`);
    if (wp.datePublished && wp.dateModified) assert.ok(wp.datePublished <= wp.dateModified.slice(0, 10), `${t.domain}: published after modified`);
    const http = t.source_urls.filter(isHttp);
    assert.deepEqual(wp.isBasedOn, http.length === 0 ? undefined : http.length === 1 ? http[0] : http, `${t.domain}: isBasedOn`);
    if (t.auto_published) assert.equal(wp.reviewedBy, undefined, `${t.domain}: auto-published card claims a reviewer`);
    else assert.deepEqual(wp.reviewedBy, { "@type": "Organization", name: "PolicyPeek", url: "https://getpolicypeek.com/" });
    assert.ok(!JSON.stringify(wp.reviewedBy ?? {}).includes("Person"));
  }
});

test("FAQ sub-questions only appear where the stored wording answers them", () => {
  const openai = page(tools.find((t) => t.domain === "openai.com"));
  assert.ok(openai.includes("Does ChatGPT train on API data?") || /Does [^<]* train on API data\?/.test(openai));
  for (const t of tools) {
    const h = page(t);
    for (const m of h.matchAll(/<h3[^>]*>Does [^<]* train on (API data|business or enterprise accounts)\?<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g)) {
      const quoted = [...text(m[2]).matchAll(/"([^"]{12,})"/g)];
      assert.ok(quoted.length > 0, `${t.domain}: sub-question answer without a quote`);
      assert.ok(/policy wording PolicyPeek recorded says/.test(text(m[2])));
    }
    assert.ok(!/\bcompliant\b/i.test(text(h.match(/<section class="tool-faq"[\s\S]*?<\/section>/)?.[0] ?? "")), `${t.domain}: legal wording in FAQ`);
  }
});
