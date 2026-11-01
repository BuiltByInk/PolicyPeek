import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const robots = readFileSync(join(root, "public/robots.txt"), "utf8");

function sectionFor(agent) {
  // Find the User-agent block that includes this agent and ends at the next blank+User-agent or end
  const lines = robots.split("\n");
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("User-agent:")) {
      const agents = [];
      while (i < lines.length && lines[i].startsWith("User-agent:")) {
        agents.push(lines[i].slice("User-agent:".length).trim());
        i++;
      }
      const rules = [];
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("User-agent:") && !lines[i].startsWith("Sitemap:")) {
        if (!lines[i].startsWith("#")) rules.push(lines[i].trim());
        i++;
      }
      if (agents.includes(agent)) return { agents, rules };
      continue;
    }
    i++;
  }
  return null;
}

const ALLOWED = [
  "Googlebot", "bingbot", "Applebot",
  "OAI-SearchBot", "ChatGPT-User",
  "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User",
  "DuckAssistBot", "Bravebot", "YouBot",
  "ExaSearchBot", "LinkupBot", "ShapBot",
  "GPTBot", "ClaudeBot",
  "facebookexternalhit", "Twitterbot",
];

const BLOCKED = [
  "meta-externalagent", "meta-externalads", "Reflectionbot", "ElevenlabsCrawler",
  "AionBot", "TokenFoundryBot", "Bytespider", "CCBot", "AwarioBot", "QlyzeBot",
  "Barkrowler", "SERankingBacklinksBot", "SenderBot", "TernCrawler", "SQLSpider", "SpiderLing",
];

test("robots.txt allows the keep list", () => {
  for (const a of ALLOWED) {
    const s = sectionFor(a);
    assert.ok(s, `missing User-agent: ${a}`);
    assert.ok(s.rules.includes("Allow: /"), `${a} must Allow: /`);
    assert.ok(!s.rules.includes("Disallow: /"), `${a} must not Disallow: /`);
  }
});

test("robots.txt blocks the block list", () => {
  for (const a of BLOCKED) {
    const s = sectionFor(a);
    assert.ok(s, `missing User-agent: ${a}`);
    assert.ok(s.rules.includes("Disallow: /"), `${a} must Disallow: /`);
  }
});

test("robots.txt keeps Sitemap", () => {
  assert.match(robots, /^Sitemap:\s+https:\/\/getpolicypeek\.com\/sitemap-index\.xml$/m);
});
