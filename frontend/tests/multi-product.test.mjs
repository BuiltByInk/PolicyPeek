// Several products per domain (D4, Marketing's best-answer plan, 18 Nov 2026).
// 1. With the real (empty) registry every card keeps /tools/<domain>/.
// 2. A test-only registry (PP_PRODUCTS_TEST) moves one card to
//    /tools/<parent>/<slug>/ with 301s from the old path, sitemap, Markdown
//    twin, canonical and internal links all following.
// 3. /v1/lookup needs no change: the most specific host wins.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toolPath, toolUrl, toolMdPath, toolRouteParam, productRedirects, validateProducts, loadProducts } from "../src/toolPaths.mjs";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(FRONTEND, "..");
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const MOVED = "mistral.ai";
const FIXTURE = { [MOVED]: { parent: "example.com", slug: "le-chat" } };

const build = (extraEnv = {}) => {
  const dist = mkdtempSync(join(tmpdir(), "pp-d4-test-"));
  const env = { ...process.env, ...extraEnv }; delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
  return dist;
};
let plain, moved;
before(() => { plain = build(); moved = build({ PP_PRODUCTS_TEST: JSON.stringify(FIXTURE) }); });
after(() => { for (const d of [plain, moved]) if (d) rmSync(d, { recursive: true, force: true }); });

test("helpers: default paths unchanged; registry paths nested; redirects cover slash, no slash and .md", () => {
  assert.deepEqual(loadProducts(), {}, "registry is empty until a product card is approved");
  assert.equal(toolPath("openai.com"), "/tools/openai.com/");
  assert.equal(toolUrl("openai.com"), "https://getpolicypeek.com/tools/openai.com/");
  assert.equal(toolMdPath("openai.com"), "/tools/openai.com.md");
  assert.equal(toolRouteParam("openai.com"), "openai.com");
  const reg = { "notebooklm.google.com": { parent: "google.com", slug: "notebooklm" } };
  assert.equal(toolPath("notebooklm.google.com", reg), "/tools/google.com/notebooklm/");
  assert.equal(toolMdPath("notebooklm.google.com", reg), "/tools/google.com/notebooklm.md");
  assert.equal(toolRouteParam("notebooklm.google.com", reg), "google.com/notebooklm");
  assert.equal(toolPath("google.com", reg), "/tools/google.com/", "the parent card keeps its URL");
  assert.deepEqual(productRedirects(reg), [
    "/tools/notebooklm.google.com /tools/google.com/notebooklm/ 301",
    "/tools/notebooklm.google.com/ /tools/google.com/notebooklm/ 301",
    "/tools/notebooklm.google.com.md /tools/google.com/notebooklm.md 301",
  ]);
  assert.deepEqual(productRedirects({}), []);
});

test("validateProducts rejects unknown keys, bad slugs, duplicate URLs and nested products", () => {
  const ts = [{ domain: "a.com" }, { domain: "b.com" }, { domain: "c.com" }];
  assert.deepEqual(validateProducts({ "a.com": { parent: "x.com", slug: "a" } }, ts), []);
  assert.ok(validateProducts({ "z.com": { parent: "x.com", slug: "z" } }, ts).some((p) => /not a catalog domain/.test(p)));
  assert.ok(validateProducts({ "a.com": { parent: "x.com", slug: "Bad Slug" } }, ts).some((p) => /slug/.test(p)));
  assert.ok(validateProducts({ "a.com": { parent: "x.com", slug: "a.com" } }, ts).some((p) => /looks like a domain/.test(p)));
  assert.ok(validateProducts({ "a.com": { parent: "x.com", slug: "s" }, "b.com": { parent: "x.com", slug: "s" } }, ts).some((p) => /same URL/.test(p)));
  assert.ok(validateProducts({ "a.com": { parent: "b.com", slug: "s" }, "b.com": { parent: "x.com", slug: "t" } }, ts).some((p) => /one level only/.test(p)));
  assert.deepEqual(validateProducts(loadProducts(), tools), [], "the committed registry is valid");
});

test("real registry: every existing tool URL, .md twin and sitemap entry is unchanged; no product redirects", () => {
  const sm = readFileSync(join(plain, "sitemap-0.xml"), "utf8");
  for (const t of tools) {
    assert.ok(existsSync(join(plain, `tools/${t.domain}/index.html`)), t.domain);
    assert.ok(existsSync(join(plain, `tools/${t.domain}.md`)), `${t.domain}.md`);
    assert.equal(sm.includes(`<loc>https://getpolicypeek.com/tools/${t.domain}/</loc>`), t.compliance_status !== "not_ai_tool", t.domain);
  }
  assert.doesNotMatch(readFileSync(join(plain, "_redirects"), "utf8"), /Product URLs \(D4/);
});

test("test registry: the product card moves, the old path 301s, and links, sitemap, canonical and .md follow", () => {
  const to = "/tools/example.com/le-chat/";
  const page = readFileSync(join(moved, "tools/example.com/le-chat/index.html"), "utf8");
  assert.ok(!existsSync(join(moved, `tools/${MOVED}/index.html`)), "old page not built (the 301 serves it)");
  assert.ok(existsSync(join(moved, "tools/example.com/le-chat.md")));
  assert.match(page, new RegExp(`<link rel="canonical" href="https://getpolicypeek.com${to}"`));
  const red = readFileSync(join(moved, "_redirects"), "utf8");
  for (const l of [`/tools/${MOVED} ${to} 301`, `/tools/${MOVED}/ ${to} 301`, `/tools/${MOVED}.md /tools/example.com/le-chat.md 301`]) assert.ok(red.includes(l), l);
  const sm = readFileSync(join(moved, "sitemap-0.xml"), "utf8");
  assert.ok(sm.includes(`<loc>https://getpolicypeek.com${to}</loc>`) && !sm.includes(`/tools/${MOVED}/<`));
  assert.ok(readFileSync(join(moved, "tools/index.html"), "utf8").includes(`href="${to}"`), "/tools/ links the new URL");
  for (const t of tools.filter((x) => x.domain !== MOVED)) assert.ok(existsSync(join(moved, `tools/${t.domain}/index.html`)), t.domain);
  const anyOld = tools.filter((x) => x.domain !== MOVED).some((t) => readFileSync(join(moved, `tools/${t.domain}/index.html`), "utf8").includes(`href="/tools/${MOVED}/"`));
  assert.equal(anyOld, false, "no internal link to the old path");
});

test("/v1/lookup needs no change: a product host is tried before its apex", () => {
  const hook = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return n(s + ".ts", c); throw e; } }`;
  const out = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
    `import { register } from "node:module"; register(${JSON.stringify("data:text/javascript," + encodeURIComponent(hook))});
     const m = await import(${JSON.stringify(join(REPO, "backend/src/lookup.ts"))});
     console.log(JSON.stringify([m.suffixCandidates("notebooklm.google.com"), m.suffixCandidates("photos.google.com")]));`], { encoding: "utf8" }));
  assert.deepEqual(out, [["notebooklm.google.com", "google.com"], ["photos.google.com", "google.com"]]);
});
