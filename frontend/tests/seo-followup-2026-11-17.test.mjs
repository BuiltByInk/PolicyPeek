// Source-level checks for the 17 Nov 2026 SEO follow-up (remap, counts, homepage).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCounts, COUNT_TOKENS } from "../integrations/catalog-counts.mjs";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const read = (...p) => readFileSync(join(FRONTEND, ...p), "utf8");
const SMB = "do-uk-small-businesses-need-an-ai-policy";
const CUSTOMER = "is-it-safe-to-put-customer-data-into-chatgpt-uk-gdpr";
const CHECKER = "free-ai-privacy-policy-checker";
const REMAP = ["zendesk.com", "intercom.com", "slack.com", "microsoft.com"];

test("Zendesk, Intercom, Slack and Copilot mention the UK SMB and customer-data guides, not the free-checker", () => {
  const smb = read("src/guides", `${SMB}.md`);
  const customer = read("src/guides", `${CUSTOMER}.md`);
  const checker = read("src/guides", `${CHECKER}.md`);
  for (const d of REMAP) {
    const needle = `getpolicypeek.com/tools/${d}/`;
    assert.ok(smb.includes(needle), `${d} should be linked from the UK SMB guide`);
    assert.ok(customer.includes(needle), `${d} should be linked from the customer-data guide`);
    assert.ok(!checker.includes(needle), `${d} should no longer be linked from the free-checker guide`);
  }
});

test("guide Markdown present-tense catalog counts use build-time tokens, not a stale 61", () => {
  const dir = join(FRONTEND, "src/guides");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const md = read("src/guides", f);
    const present = md.split("\n").filter((line) =>
      /\b61\b/.test(line) && !/^\s*-\s+\d+ \w+ 2026:/.test(line)
    );
    assert.deepEqual(present, [], `${f} still has a present-tense 61`);
    const rendered = applyCounts(md);
    // Historical changelog lines may still say "updated to 61".
    const current = rendered.split("\n").filter((line) =>
      /\b61 (AI )?tools\b/.test(line) && !/^\s*-\s+\d+ \w+ 2026:/.test(line)
    );
    assert.deepEqual(current, [], `${f} still says "61 tools" after substitution`);
  }
  assert.equal(COUNT_TOKENS.TOOL_COUNT, "68");
  assert.equal(COUNT_TOKENS.RATED_COUNT, "67");
});

test("homepage keeps the don't-train guide and adds Marketing's four anchors", () => {
  const src = read("src/pages/index.astro");
  assert.match(src, /href="\/guides\/ai-tools-that-dont-train-on-your-data-uk\/"/);
  const expected = [
    ["How to check if an app trains on your data", "/guides/how-to-check-if-an-app-trains-ai-on-your-data/"],
    ["How to opt out of training on creative tools", "/guides/how-to-opt-out-of-ai-training-image-video-music-tools/"],
    ["Does ChatGPT train on your data?", "/guides/does-chatgpt-train-on-your-data/"],
    ["Free AI privacy policy checker", "/guides/free-ai-privacy-policy-checker/"],
  ];
  for (const [anchor, href] of expected) {
    const re = new RegExp(`<a href="${href.replaceAll("/", "\\/")}">${anchor.replaceAll("?", "\\?")}</a>`);
    assert.match(src, re, `missing homepage link: ${anchor}`);
  }
});

test("low-risk in-page /tools and /about links use trailing slashes", () => {
  const files = [
    "src/pages/index.astro",
    "src/pages/about.astro",
    "src/pages/tools/index.astro",
    "src/pages/tools/[domain].astro",
  ];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /href="\/tools"/, f);
    assert.doesNotMatch(src, /href="\/about"/, f);
  }
});

// Built-HTML checks run after `npm run build`.
const dist = join(FRONTEND, "dist");
if (existsSync(join(dist, "index.html"))) {
  const distRead = (...p) => readFileSync(join(dist, ...p), "utf8");
  const hrefs = (html) => {
    const sec = html.match(/class="guides-for"[\s\S]*?<\/section>/)?.[0] ?? "";
    return [...sec.matchAll(/href="\/guides\/([^"/]+)\/"/g)].map((x) => x[1]);
  };

  test("built tool pages list the UK SMB guide first, then the customer-data guide", () => {
    for (const d of REMAP) {
      const html = distRead("tools", d, "index.html");
      const slugs = hrefs(html, d);
      assert.ok(slugs.includes(SMB), `${d} missing UK SMB guide`);
      assert.ok(slugs.includes(CUSTOMER), `${d} missing customer-data guide`);
      assert.equal(slugs[0], SMB, `${d} primary guide should be UK SMB, got ${slugs[0]}`);
      assert.ok(!slugs.includes(CHECKER), `${d} should not link the free-checker guide`);
    }
  });

  test("built homepage has the four new guide anchors and trailing-slash methodology link", () => {
    const home = distRead("index.html");
    const has = (href, anchor) =>
      new RegExp(`<a href="${href.replaceAll("/", "\\/")}"[^>]*>${anchor.replaceAll("?", "\\?")}</a>`);
    assert.match(home, /href="\/guides\/ai-tools-that-dont-train-on-your-data-uk\/"/);
    assert.match(home, has("/guides/how-to-check-if-an-app-trains-ai-on-your-data/", "How to check if an app trains on your data"));
    assert.match(home, has("/guides/how-to-opt-out-of-ai-training-image-video-music-tools/", "How to opt out of training on creative tools"));
    assert.match(home, has("/guides/does-chatgpt-train-on-your-data/", "Does ChatGPT train on your data?"));
    assert.match(home, has("/guides/free-ai-privacy-policy-checker/", "Free AI privacy policy checker"));
    assert.match(home, /href="\/about\/"[^>]*>Read the full methodology/);
  });
}
