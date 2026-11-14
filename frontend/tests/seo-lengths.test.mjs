// SEO follow-up (2026-11-04): every built page's <title> <= 60 chars and
// meta description <= 160 chars. Runs against dist/ (build first).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const pages = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === "index.html") pages.push(p); } };
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

test("built pages exist", () => { assert.ok(existsSync(dist), "run npm run build first"); walk(dist); assert.ok(pages.length > 50); });
test("every <title> is 60 characters or fewer, except tool pages which include (checked Mon YYYY)", () => {
  const bad = pages.map((p) => [p, unesc(readFileSync(p, "utf8").match(/<title>([^<]*)<\/title>/)?.[1] ?? "")]).filter(([p, t]) => {
    const isTool = p.includes("/tools/") && !p.endsWith("/tools/index.html");
    if (isTool) return false;
    return t.length > 60;
  });
  assert.deepEqual(bad, []);
});
test("every meta description is 160 characters or fewer", () => {
  const bad = pages.map((p) => [p, unesc(readFileSync(p, "utf8").match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "")]).filter(([, d]) => d.length > 160);
  assert.deepEqual(bad, []);
});
test("openai and claude titles ask the question and include the last-checked month", () => {
  for (const [d, n] of [["openai.com", "ChatGPT"], ["claude.com", "Claude"]]) {
    const t = unesc(readFileSync(join(dist, "tools", d, "index.html"), "utf8").match(/<title>([^<]*)<\/title>/)[1]);
    assert.match(t, new RegExp(`^Does ${n} train on your data\\? \\(checked [A-Z][a-z]+ 20\\d{2}\\) · PolicyPeek$`));
  }
});
test("thin tool pages have the catalog Q&A section", () => {
  for (const d of ["meshy.ai", "kimi.com", "invideo.io", "elevenlabs.io", "bolt.new"]) {
    const h = readFileSync(join(dist, "tools", d, "index.html"), "utf8");
    assert.match(h, /Common questions about/, d);
    assert.match(h, /How long does .+ keep my data\?/, d);
  }
});
