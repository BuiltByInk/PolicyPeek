// llms.txt v2 (D3, Marketing's best-answer plan, 18 Nov 2026): every rated
// tool listed from tools.json, counts that add up, and the same rated count
// the tool pages use. Builds its own dist.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const rated = tools.filter((t) => t.compliance_status !== "not_ai_tool");
const { VERDICTS } = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, "src/verdicts.ts"))}); console.log(JSON.stringify({ VERDICTS: m.VERDICTS }));`], { encoding: "utf8" }));

let dist, llms, full;
before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-llms-test-"));
  const env = { ...process.env }; delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
  llms = readFileSync(join(dist, "llms.txt"), "utf8");
  full = readFileSync(join(dist, "llms-full.txt"), "utf8");
});
after(() => dist && rmSync(dist, { recursive: true, force: true }));

test("## Tools lists every rated tool once, with its badge label and a working .md twin; not-an-AI-tool pages are left out", () => {
  const section = llms.split("\n## Tools\n")[1].split("\n## ")[0];
  const lines = section.trim().split("\n");
  assert.equal(lines.length, rated.length);
  for (const t of rated) {
    const line = lines.find((l) => l.includes(`(https://getpolicypeek.com/tools/${t.domain}.md)`));
    assert.ok(line, `${t.domain} listed`);
    assert.ok(line.startsWith(`- [Does ${t.name} train on your data?]`), t.domain);
    assert.ok(line.includes(`: ${VERDICTS.find((v) => v.status === t.compliance_status).label}.`), `${t.domain} badge label`);
    assert.ok(existsSync(join(dist, `tools/${t.domain}.md`)), `${t.domain}.md exists`);
    if (t.last_checked_at) assert.match(line, /Checked \d{1,2} [A-Z][a-z]{2,3} \d{4}\.$/);
  }
  for (const t of tools.filter((x) => x.compliance_status === "not_ai_tool")) assert.ok(!section.includes(`/tools/${t.domain}`), t.domain);
  assert.doesNotMatch(section, /\bcompliant\b/i);
  assert.ok(full.includes(section.trim()), "llms-full.txt carries the same list");
});

test("counts add up: header = rated AI tools (same figure as tool pages), breakdown sums to the total", () => {
  assert.match(llms, new RegExp(`\\. ${rated.length} AI tools rated, `));
  const counts = llms.match(/^Current counts: (.*)$/m)[1];
  const nums = [...counts.replace(/\(\d+ in total\)/, "").matchAll(/(\d+) /g)].map((m) => Number(m[1]));
  assert.equal(nums.reduce((a, b) => a + b, 0), tools.length);
  assert.match(counts, new RegExp(`\\(${tools.length} in total\\)`));
  const page = readFileSync(join(dist, `tools/${rated[0].domain}/index.html`), "utf8");
  const m = page.match(/of the (\d+) AI tools PolicyPeek lists/);
  if (m) assert.equal(Number(m[1]), rated.length, "tool pages and llms.txt use the same rated count");
});

test("v2 extras: last-updated date, how-to-cite line, changes links; core links kept", () => {
  assert.match(llms, /^Last updated: \d{4}-\d{2}-\d{2}$/m);
  assert.match(llms, /^How to cite: "PolicyPeek, \{tool\} card, checked \{date\}"/m);
  assert.ok(llms.includes("(https://getpolicypeek.com/changes/)") && llms.includes("(https://getpolicypeek.com/changes/rss.xml)"));
  assert.ok(existsSync(join(dist, "changes/rss.xml")));
  assert.ok(llms.includes("[Methodology](https://getpolicypeek.com/methodology/)"));
  assert.doesNotMatch(llms, /InkLLM|checkout|buy now|pricing/i);
});
