// Approved batch files are well-formed, use real badges, don't re-add a
// published tool, and never contain a held tool.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const BATCHES = join(REPO, "batches");
const BADGES = new Set(["compliant", "compliant_with_caveats", "not_compliant"]);
const HELD = ["pi.ai", "leonardo.ai", "notebooklm.google.com", "canva.com", "descript.com", "grok.com", "x.ai", "mistral.ai", "character.ai", "firefly.adobe.com", "meta.ai", "gamma.app", "poe.com", "synthesia.io", "pika.art", "capcut.com", "kimi.ai", "kimi.com", "hubspot.com", "loom.com", "buffer.com", "manychat.com", "murf.ai", "surferseo.com", "zapier.com", "notion.so", "notion.com"];
const published = new Set(JSON.parse(readFileSync(join(REPO, "frontend/data/tools.json"), "utf8")).map((t) => t.domain));
const dirs = readdirSync(BATCHES, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(BATCHES, d.name, "tools.json"))).map((d) => d.name);

test("there are batch files", () => assert.ok(dirs.length >= 2));
const seen = new Set();
for (const d of dirs) {
  test(`batch ${d} is valid`, () => {
    const tools = JSON.parse(readFileSync(join(BATCHES, d, "tools.json"), "utf8"));
    assert.ok(tools.length > 0);
    for (const t of tools) {
      assert.deepEqual(Object.keys(t).sort(), ["badge", "domain", "name", "source_url", "summary"]);
      assert.ok(BADGES.has(t.badge), `${t.domain} badge ${t.badge}`);
      assert.match(t.domain, /^[a-z0-9.-]+\.[a-z]+$/);
      const host = new URL(t.source_url).hostname;
      assert.ok(host === t.domain || host.endsWith(`.${t.domain}`), `${t.domain} source on ${host}`);
      assert.ok(t.summary.length > 20);
      assert.ok(!published.has(t.domain), `${t.domain} already published`);
      assert.ok(!HELD.includes(t.domain), `${t.domain} is held`);
      assert.ok(!seen.has(t.domain), `${t.domain} in two batches`); seen.add(t.domain);
    }
  });
}
