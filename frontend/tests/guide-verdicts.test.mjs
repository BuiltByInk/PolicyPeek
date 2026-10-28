// Every guide table row that links a /tools/<domain>/ page and shows a bold
// badge must show that tool's current catalog badge, so a verdict change in
// tools.json can't leave a guide saying the old one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const VERDICTS = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `const m = await import(${JSON.stringify(join(FRONTEND, "src/verdicts.ts"))}); console.log(JSON.stringify(m.VERDICTS));`], { encoding: "utf8" }));
const label = Object.fromEntries(VERDICTS.map((v) => [v.status, v.label]));
const GUIDES = join(FRONTEND, "src/guides");

test("guide table badges match the catalog verdict for every linked tool", () => {
  let rows = 0;
  const wrong = [];
  for (const f of readdirSync(GUIDES).filter((f) => f.endsWith(".md"))) {
    for (const line of readFileSync(join(GUIDES, f), "utf8").split("\n")) {
      const m = line.match(/^\| \[[^\]]+\]\(https:\/\/getpolicypeek\.com\/tools\/([^/)]+)\/\) \| \*\*([^*]+)\*\* \|/);
      if (!m) continue;
      rows++;
      const t = tools.find((x) => x.domain === m[1]);
      if (!t) wrong.push(`${f}: ${m[1]} is not in the catalog`);
      else if (label[t.compliance_status] !== m[2]) wrong.push(`${f}: ${m[1]} shows "${m[2]}", catalog is "${label[t.compliance_status]}"`);
    }
  }
  assert.ok(rows >= 30, `checked ${rows} rows`);
  assert.deepEqual(wrong, []);
});
