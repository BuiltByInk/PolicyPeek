// Static checks on the built HTML for the homepage/tool-page audit changes,
// the badge wording and the optional Cloudflare Web Analytics beacon.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
let plain, beacon;
const build = (env) => {
  const dir = mkdtempSync(join(tmpdir(), "pp-pages-test-"));
  const e = { ...process.env, ...env };
  if (!("PUBLIC_CF_BEACON_TOKEN" in env)) delete e.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env: e, stdio: "pipe" });
  return dir;
};
const read = (dir, p) => readFileSync(join(dir, p), "utf8");

before(() => {
  plain = build({});
  beacon = build({ PUBLIC_CF_BEACON_TOKEN: "test-token-123" });
});
after(() => [plain, beacon].forEach((d) => d && rmSync(d, { recursive: true, force: true })));

test("homepage: new eyebrow, label, quick picks, sample card, no jargon eyebrow", () => {
  const h = read(plain, "index.html");
  assert.match(h, /Free · AI tools · Sourced from the policy/);
  assert.match(h, /Which AI tool do you use\?/);
  assert.doesNotMatch(h, /Data Practices Disclosure/);
  assert.match(h, /class="picks"/);
  assert.match(h, /href="\/tools\/openai\.com\/"/);
  assert.match(h, /Example: ChatGPT/);
  assert.match(h, /AI tools? checked\. Here's how they score\./);
});

test("no page uses the word 'Compliant' or 'GDPR Check' in visible text or titles", () => {
  const files = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".html") && files.push(join(d, e.name)));
  walk(plain);
  for (const f of files) {
    const text = readFileSync(f, "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
      .replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(text, /\bcompliant\b/i, f);
    assert.doesNotMatch(readFileSync(f, "utf8"), /GDPR Check/, f);
  }
});

test("tool page: plain answer, check another, share button", () => {
  const h = read(plain, "tools/openai.com/index.html");
  assert.match(h, /class="answer"[^>]*>Yes, by default\. ChatGPT(&#39;|')s published policy says it may train on your data, but you can opt out\./);
  assert.match(h, /Check another tool/);
  assert.match(h, /Copy link \/ share this verdict/);
  assert.match(h, /data-share-url="https:\/\/[^"]+\/tools\/openai\.com\/"/);
});

test("Cloudflare beacon only renders when a token is configured", () => {
  assert.doesNotMatch(read(plain, "index.html"), /cloudflareinsights/);
  const h = read(beacon, "index.html");
  assert.match(h, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
  assert.match(h, /test-token-123/);
});

test("tool page verdict card label reads 'What the policy says' (no 'Data Practices Disclosure')", () => {
  const h = read(plain, "tools/claude.com/index.html");
  assert.match(h, /id="lp-h"[^>]*>What the policy says</);
  assert.doesNotMatch(h, /Data Practices Disclosure/i);
});

test("SEO: tool page title/description from the verdict, related links, every tool linked from / and /tools/", () => {
  const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
  const home = read(plain, "index.html");
  const list = read(plain, "tools/index.html");
  for (const t of tools) {
    assert.ok(home.includes(`href="/tools/${t.domain}/"`), `homepage links ${t.domain}`);
    assert.ok(list.includes(`href="/tools/${t.domain}/"`), `/tools/ links ${t.domain}`);
  }
  const h = read(plain, "tools/cursor.com/index.html");
  assert.match(h, /<title>Does Cursor train on my data\? AI training &amp; GDPR · PolicyPeek<\/title>/);
  assert.match(h, /name="description" content="Does Cursor train on my data\? Opt-out available: /);
  assert.match(h, /id="rel-h"[^>]*>Related tools</);
  assert.ok((h.match(/class="related"[\s\S]*?<\/section>/)[0].match(/href="\/tools\/[^"]+\/"/g) || []).length >= 3);
  assert.doesNotMatch(h, /href="\/tools\/cursor\.com\/"[^>]*>Does Cursor/);
  assert.match(h, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/tools\/cursor\.com\/">/);
  assert.match(h, /og:url" content="https:\/\/getpolicypeek\.com\/tools\/cursor\.com\/"/);
});

test("nav: 'For businesses' links to /policy-pack/ on every page", () => {
  for (const p of ["index.html", "guides/index.html", "tools/openai.com/index.html", "about/index.html"]) {
    assert.match(read(plain, p), /<nav class="site"[^>]*>[\s\S]*?<a href="\/policy-pack\/"[^>]*>For businesses<\/a>[\s\S]*?<\/nav>/, p);
  }
  assert.match(read(plain, "policy-pack/index.html"), /<a href="\/policy-pack\/" aria-current="page"[^>]*>For businesses<\/a>/);
});

test("homepage: calm 'For UK small businesses' section with 4 products, shop link and free checklist", () => {
  const h = read(plain, "index.html");
  const m = h.match(/<section class="biz"[\s\S]*?<\/section>/);
  assert.ok(m, "biz section present");
  const s = m[0];
  assert.match(s, /For UK small businesses/);
  for (const n of ["AI Policy Starter Pack", "Staff AI Training Kit", "Starter Pack + Training Kit bundle", "AI Incident Response One-Pager"]) assert.ok(s.includes(n), n);
  for (const p of ["£19 / £39", "£29", "£59", "£19"]) assert.ok(s.includes(p), p);
  assert.match(s, /href="\/policy-pack\/"/);
  assert.match(s, /inkspire776\.gumroad\.com\/l\/rppfze\?[^"]*utm_campaign=homepage-biz/);
  assert.match(s, /by InkLLM/);
  assert.match(s, /include VAT for UK buyers/);
  assert.ok(h.indexOf('class="register"') < h.indexOf('class="biz"'), "below the verdict summary");
});

test("guides: each ends with the free checklist and a contextual business-resources line", () => {
  const g = read(plain, "guides/does-mailchimp-use-your-data-for-ai-training/index.html");
  assert.match(g, /rhfram/);
  assert.match(g, /class="pack-cta"[^>]*>[^<]*Incident Response[\s\S]*?href="\/policy-pack\/"/);
  const c = read(plain, "guides/do-ai-coding-assistants-train-on-your-code/index.html");
  assert.match(c, /class="pack-cta"[^>]*>[^<]*Starter Pack[\s\S]*?href="\/policy-pack\/"/);
  assert.doesNotMatch(read(plain, "guides/does-chatgpt-train-on-your-data.md"), /policy-pack/);
});
