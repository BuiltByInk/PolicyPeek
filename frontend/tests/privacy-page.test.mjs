// /privacy notice (2026-11-10, Security review blocker 1).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
let dist;
const read = (p) => readFileSync(join(dist, p), "utf8");
const text = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-privacy-test-"));
  const env = { ...process.env };
  delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("/privacy/ is built, indexable and in the sitemap", () => {
  const h = read("privacy/index.html");
  assert.match(h, /<title>Privacy notice · PolicyPeek<\/title>/);
  assert.doesNotMatch(h, /noindex/);
  const sm = readdirSync(dist).filter((f) => /^sitemap-\d+\.xml$/.test(f)).map(read).join("");
  assert.match(sm, /https:\/\/getpolicypeek\.com\/privacy\//);
});

test("/privacy/ covers blocker 1: who, purpose, lawful basis, retention, recipients, rights, ICO, objection, outreach and watcher data, IPs", () => {
  const t = text(read("privacy/index.html"));
  for (const needle of [
    "Elliot Inkley", "controller", "hello@getpolicypeek.com", "privacy@getpolicypeek.com",
    "legitimate interests", "Article 6(1)(f)",
    "12 months after", "24 months after our first email", "whichever comes first",
    "Cloudflare", "Proton", "Anthropic",
    "SPF, DKIM and DMARC", "256 KB",
    "PolicyPeek-PolicyWatch/1.0", "robots.txt", "latest 10 versions",
    "IP address", "deleted every day",
    "Information Commissioner's Office", "ico.org.uk/make-a-complaint",
    "Reply \"stop\"", "object",
  ]) assert.ok(t.includes(needle), `missing: ${needle}`);
});

test("/privacy/ makes no ICO-registration, InkLLM, sales or paid claims", () => {
  const t = text(read("privacy/index.html")).toLowerCase();
  for (const bad of ["registered with the ico", "ico registration", "registration number", "inkllm", "gumroad", "pricing", "buy ", "paid plan", "premium", "subscribe"])
    assert.ok(!t.includes(bad), `must not contain: ${bad}`);
});

test("every page's footer links the privacy notice", () => {
  for (const p of ["index.html", "about/index.html", "methodology/index.html", "privacy/index.html"]) {
    assert.match(read(p), /<footer class="site">[\s\S]*href="\/privacy\/"[\s\S]*<\/footer>/, p);
  }
});
