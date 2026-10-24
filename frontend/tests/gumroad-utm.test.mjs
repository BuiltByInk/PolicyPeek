// Every Gumroad link in the built site must carry UTM tags; IndexNow key file must exist.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-utm-test-"));
  const e = { ...process.env }; delete e.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env: e, stdio: "pipe" });
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test("all gumroad product links carry utm tags", () => {
  let n = 0;
  for (const f of walk(dir).filter((p) => p.endsWith(".html"))) {
    const html = readFileSync(f, "utf8");
    for (const m of html.matchAll(/href="(https:\/\/[^"]*gumroad\.com\/l\/[^"]*)"/g)) {
      n++;
      const u = new URL(m[1].replace(/&amp;/g, "&"));
      assert.equal(u.searchParams.get("utm_source"), "policypeek", f);
      assert.equal(u.searchParams.get("utm_medium"), "site", f);
      assert.ok(u.searchParams.get("utm_campaign"), f);
    }
  }
  assert.ok(n >= 15, `expected many gumroad links, got ${n}`);
  const pp = readFileSync(join(dir, "policy-pack/index.html"), "utf8");
  assert.match(pp, /utm_campaign=policy-pack/);
  assert.match(pp, /gumroad\.com\/js\/gumroad\.js/);
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /utm_campaign=homepage/);
});

test("indexnow key file is served with its own key", () => {
  const keys = readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(keys.length, 1);
  assert.equal(readFileSync(join(dir, keys[0]), "utf8").trim(), keys[0].slice(0, 32));
});
