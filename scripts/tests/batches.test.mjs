// Approved batch files are well-formed, use real badges, and never contain a
// held tool. Rows already published (in frontend/data/tools.json) are reported
// as published and skipped by the "not yet live" rules; the remaining rows are
// the ones still awaiting a re-check and must stay valid for the next run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const BATCHES = join(REPO, "batches");
const BADGES = new Set(["compliant", "compliant_with_caveats", "not_compliant", "unrated"]);
const HELD = ["pi.ai", "leonardo.ai", "notebooklm.google.com", "notebooklm.google", "canva.com", "descript.com", "grok.com", "x.ai", "firefly.adobe.com", "meta.ai", "gamma.app", "synthesia.io", "capcut.com", "loom.com", "manychat.com", "murf.ai", "surferseo.com", "notion.so", "notion.com"];
// Known issues: FLAGGED (the test fails naming the reason) rather than silently
// dropped, so a person decides. Shared-domain list is read from the backend.
const SHARED = [...readFileSync(join(REPO, "backend/src/sharedDomains.ts"), "utf8").match(/KNOWN_SHARED_DOMAINS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const FETCH_BLOCKED = { "pi.ai": "pi.ai/policy returns 403 to the pipeline; archive copy only from 2025-04 and unreachable (re-tested 2026-10-23)", "leonardo.ai": "leonardo.ai/privacy-policy/ returns 403 to the pipeline; no archive snapshot (re-tested 2026-10-23)" };
export function flagsFor(t) {
  const f = [];
  const hit = (h) => SHARED.find((s) => h === s || h.endsWith(`.${s}`));
  if (hit(t.domain)) f.push(`domain ${t.domain} is under shared domain ${hit(t.domain)}: pipeline forces company-wide`);
  const host = new URL(t.source_url).hostname;
  if (!(host === t.domain || host.endsWith(`.${t.domain}`))) f.push(`source host ${host} is not on ${t.domain}${hit(host) ? ` (and is under shared domain ${hit(host)})` : ""}`);
  if (FETCH_BLOCKED[t.domain]) f.push(FETCH_BLOCKED[t.domain]);
  return f;
}
const published = new Set(JSON.parse(readFileSync(join(REPO, "frontend/data/tools.json"), "utf8")).map((t) => t.domain));
const dirs = readdirSync(BATCHES, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(BATCHES, d.name, "tools.json"))).map((d) => d.name);

test("there are batch files", () => assert.ok(dirs.length >= 2));
const seen = new Set();
for (const d of dirs) {
  test(`batch ${d} is valid`, (ctx) => {
    const tools = JSON.parse(readFileSync(join(BATCHES, d, "tools.json"), "utf8"));
    const done = [], pending = [];
    assert.ok(tools.length > 0);
    for (const t of tools) {
      assert.deepEqual(Object.keys(t).sort(), ["badge", "domain", "name", "source_url", "summary"]);
      assert.ok(BADGES.has(t.badge), `${t.domain} badge ${t.badge}`);
      assert.match(t.domain, /^[a-z0-9.-]+\.[a-z]+$/);
      const flags = flagsFor(t);
      assert.deepEqual(flags, [], `FLAG ${t.domain}: ${flags.join("; ")}`);
      assert.ok(t.summary.length > 20);
      assert.ok(!HELD.includes(t.domain), `${t.domain} is held`);
      assert.ok(!seen.has(t.domain), `${t.domain} in two batches`); seen.add(t.domain);
      (published.has(t.domain) ? done : pending).push(t.domain);
    }
    ctx.diagnostic(`published: ${done.join(", ") || "none"}; awaiting re-check: ${pending.join(", ") || "none"}`);
  });
}

test("validator flags the known Batch B issues", () => {
  assert.match(flagsFor({ domain: "notebooklm.google.com", source_url: "https://support.google.com/notebooklm/answer/16164461" }).join(), /shared domain google\.com/);
  assert.match(flagsFor({ domain: "notebooklm.google", source_url: "https://support.google.com/notebooklm/answer/16164461" }).join(), /not on notebooklm\.google.*shared domain google\.com/);
  assert.match(flagsFor({ domain: "pi.ai", source_url: "https://pi.ai/policy" }).join(), /403/);
  assert.match(flagsFor({ domain: "leonardo.ai", source_url: "https://leonardo.ai/privacy-policy/" }).join(), /403/);
  assert.deepEqual(flagsFor({ domain: "hubspot.com", source_url: "https://knowledge.hubspot.com/x" }), []);
});
