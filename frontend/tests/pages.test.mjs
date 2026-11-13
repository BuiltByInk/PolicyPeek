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
  if (!("PUBLIC_CF_BEACON_TOKEN" in env)) e.PUBLIC_CF_BEACON_TOKEN = "";
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
  const h = read(plain, "tools/claude.com/index.html");
  assert.match(h, /<title>Does Claude train on your data\? \(checked [A-Z][a-z]+ 20\d{2}\) · PolicyPeek<\/title>/);
  assert.match(h, /name="description" content="Yes, by default. Claude/);
  assert.match(h, /may train on your data, but you can opt out/);
  assert.match(h, /id="rel-h"[^>]*>Related tools</);
  assert.ok((h.match(/class="related"[\s\S]*?<\/section>/)[0].match(/href="\/tools\/[^"]+\/"/g) || []).length >= 3);
  assert.doesNotMatch(h, /href="\/tools\/claude\.com\/"[^>]*>Does Claude/);
  assert.match(h, /<link rel="canonical" href="https:\/\/getpolicypeek\.com\/tools\/claude\.com\/">/);
  assert.match(h, /og:url" content="https:\/\/getpolicypeek\.com\/tools\/claude\.com\/"/);
});

test("nav is Tools, Guides and Methodology, with no business link", () => {
  for (const p of ["index.html", "guides/index.html", "tools/openai.com/index.html", "about/index.html"]) {
    const nav = read(plain, p).match(/<nav class="site"[\s\S]*?<\/nav>/)[0];
    assert.match(nav, /href="\/tools"/, p);
    assert.match(nav, /href="\/guides\/"/, p);
    assert.match(nav, /href="\/about"/, p);
    assert.doesNotMatch(nav, /For businesses|policy-pack|InkLLM/, p);
  }
});

test("homepage is the checker, with no business products, waitlist or InkLLM", () => {
  const h = read(plain, "index.html");
  assert.match(h, /id="home-q"/);
  assert.match(h, /Which AI tool do you use\?/);
  assert.match(h, /class="register"/);
  assert.doesNotMatch(h, /For UK small businesses|class="biz"|InkLLM|gumroad|waitlist|policy-pack|Starter Pack/i);
});

test("guides and tool pages do not sell a pack or name InkLLM", () => {
  for (const p of [
    "guides/does-mailchimp-use-your-data-for-ai-training/index.html",
    "guides/do-ai-coding-assistants-train-on-your-code/index.html",
    "guides/do-uk-small-businesses-need-an-ai-policy/index.html",
    "tools/openai.com/index.html",
    "about/index.html",
  ]) {
    const h = read(plain, p);
    assert.doesNotMatch(h, /gumroad|InkLLM|policy-pack|waitlist|Starter Pack/i, p);
  }
  assert.throws(() => read(plain, "policy-pack/index.html"));
  assert.doesNotMatch(read(plain, "llms.txt"), /policy-pack|InkLLM/);
});
