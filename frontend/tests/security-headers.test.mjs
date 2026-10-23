// The built dist/_headers must carry the security headers, a real CSP (no
// leftover placeholder) and a sha256 for every executable inline script, so
// nothing Astro emits is blocked. Built both with and without the CF beacon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineScriptHashes, inlineStyleHashes, buildCsp } from "../integrations/csp.mjs";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const htmlFiles = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? htmlFiles(p) : n.endsWith(".html") ? [p] : []; });

for (const beacon of [false, true]) {
  test(`dist/_headers has security headers + complete CSP (beacon=${beacon})`, () => {
    const dir = mkdtempSync(join(tmpdir(), "pp-hdr-test-"));
    try {
      const env = { ...process.env, PUBLIC_API_BASE_URL: "https://api.getpolicypeek.com" };
      if (beacon) env.PUBLIC_CF_BEACON_TOKEN = "testtoken"; else delete env.PUBLIC_CF_BEACON_TOKEN;
      execFileSync("npx", ["astro", "build", "--outDir", dir], { cwd: FRONTEND, env, stdio: "pipe" });
      const h = readFileSync(join(dir, "_headers"), "utf8");
      assert.ok(!h.includes("__CSP__"));
      for (const name of ["Strict-Transport-Security: max-age=31536000", "X-Frame-Options: DENY", "X-Content-Type-Options: nosniff", "Referrer-Policy:", "Permissions-Policy:"]) assert.ok(h.includes(name), name);
      const csp = h.match(/Content-Security-Policy: (.*)/)[1];
      assert.ok(!/'unsafe-(inline|eval|hashes)'/.test(csp), "no unsafe-* anywhere");
      assert.match(csp, /script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
      assert.match(csp, /connect-src[^;]*https:\/\/api\.getpolicypeek\.com[^;]*https:\/\/cloudflareinsights\.com/);
      assert.match(csp, /frame-ancestors 'none'/);
      const files = htmlFiles(dir);
      assert.ok(files.length > 30);
      for (const f of files) for (const hash of inlineScriptHashes(readFileSync(f, "utf8"))) assert.ok(csp.includes(hash), `${f} inline script not in CSP`);
      for (const f of files) for (const hash of inlineStyleHashes(readFileSync(f, "utf8"))) assert.ok(csp.includes(hash), `${f} inline style not in CSP`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("inlineScriptHashes skips JSON-LD and external scripts", () => {
  const html = `<script type="application/ld+json">{"a":1}</script><script src="/x.js"></script><script type="module">go()</script>`;
  assert.equal(inlineScriptHashes(html).size, 1);
});

test("buildCsp tolerates a missing/invalid API base", () => {
  assert.match(buildCsp({ scriptHashes: new Set(), apiBase: "not a url" }), /connect-src 'self' https:\/\/cloudflareinsights\.com/);
});
