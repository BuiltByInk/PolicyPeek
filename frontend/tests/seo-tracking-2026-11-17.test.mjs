// Source-level checks for the 17 Nov 2026 SEO/tracking fixes. No build required.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCounts, COUNT_TOKENS } from "../integrations/catalog-counts.mjs";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const read = (...p) => readFileSync(join(FRONTEND, ...p), "utf8");

test("frontend/.env.production does not set a manual Cloudflare beacon token", () => {
  const env = read(".env.production");
  assert.doesNotMatch(env, /PUBLIC_CF_BEACON_TOKEN/);
  assert.match(env, /PUBLIC_API_BASE_URL=https:\/\/api\.getpolicypeek\.com/);
});

test("Layout.astro does not inject a manual Cloudflare beacon, and nav/footer use trailing slashes", () => {
  const layout = read("src/layouts/Layout.astro");
  assert.doesNotMatch(layout, /PUBLIC_CF_BEACON_TOKEN|cfBeaconToken|beacon\.min\.js|data-cf-beacon/);
  const nav = layout.match(/<nav class="site"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /href="\/tools\/"/);
  assert.match(nav, /href="\/about\/"/);
  assert.doesNotMatch(nav, /href="\/tools"(?!\/)/);
  assert.doesNotMatch(nav, /href="\/about"(?!\/)/);
  assert.match(layout, /<a href="\/about\/">how it works<\/a>/);
});

test("llms.txt Methodology points at /methodology/", () => {
  const src = read("src/pages/llms.txt.ts");
  assert.match(src, /\[Methodology\]\(\$\{SITE\}\/methodology\/\)/);
  assert.doesNotMatch(src, /\[Methodology\]\(\$\{SITE\}\/about\/\)/);
});

test("the nine tool pages that had no guide links now have at least one", () => {
  const need = [
    "zendesk.com", "intercom.com", "slack.com", "monday.com",
    "microsoft.com", "figma.com", "replit.com", "stability.ai", "duckduckgo.com",
  ];
  const dir = join(FRONTEND, "src/guides");
  const md = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => read("src/guides", f)).join("\n");
  const missing = need.filter((d) => !md.includes(`getpolicypeek.com/tools/${d}/`));
  assert.deepEqual(missing, []);
});

test("free-checker source tokens are known catalog keys, and current counts are 67/66", () => {
  const md = read("src/guides/free-ai-privacy-policy-checker.md");
  const keys = [...md.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((m) => m[1]);
  assert.ok(keys.length >= 5, "expected count tokens in the free-checker guide");
  for (const k of keys) assert.ok(k in COUNT_TOKENS, k);
  assert.equal(COUNT_TOKENS.TOOL_COUNT, "67");
  assert.equal(COUNT_TOKENS.RATED_COUNT, "66");
  assert.match(applyCounts(md), /covers 67 tools/);
  assert.doesNotMatch(applyCounts(md), /\{\{/);
});
