// Every link in the built site to a /tools/<domain>/ page (relative or
// absolute getpolicypeek.com) must point at a page that was actually built,
// so a tool removed from the catalog can't leave dead links in guides etc.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), "pp-toollinks-"));
  execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, stdio: "pipe" });
});
after(() => rmSync(dir, { recursive: true, force: true }));

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test("no built page links to a /tools/ page that doesn't exist", () => {
  const files = walk(dir).filter((f) => /\.(html|txt|xml)$/.test(f));
  const broken = [];
  let checked = 0;
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    for (const m of s.matchAll(/(?:href="|https:\/\/getpolicypeek\.com)(\/tools\/[^"'\s)#?<]+)/g)) {
      let p = m[1].replace(/\/?$/, "/");
      checked++;
      if (!existsSync(join(dir, p, "index.html"))) broken.push(`${relative(dir, f)} -> ${p}`);
    }
  }
  assert.ok(checked > 100, `found ${checked} tool links`);
  assert.deepEqual([...new Set(broken)], []);
});
