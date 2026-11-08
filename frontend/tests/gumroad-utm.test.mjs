// The public build must not sell anything. IndexNow key file must exist.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

test("public build has no InkLLM, Gumroad, waitlist or /policy-pack/", () => {
  assert.equal(existsSync(join(dir, "policy-pack")), false);
  const files = walk(dir).filter((p) => /\.(html|txt|xml|json|md)$/.test(p));
  assert.ok(files.length > 20);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.doesNotMatch(text, /InkLLM/, f);
    assert.doesNotMatch(text, /gumroad/i, f);
    assert.doesNotMatch(text, /policy-pack/, f);
    assert.doesNotMatch(text, /waitlist/i, f);
    assert.doesNotMatch(text, /For businesses/, f);
  }
  const home = readFileSync(join(dir, "index.html"), "utf8");
  assert.match(home, /id="home-q"/);
  assert.match(home, /Which AI tool do you use\?/);
});

test("indexnow key file is served with its own key", () => {
  const keys = readdirSync(dir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.equal(keys.length, 1);
  assert.equal(readFileSync(join(dir, keys[0]), "utf8").trim(), keys[0].slice(0, 32));
});
