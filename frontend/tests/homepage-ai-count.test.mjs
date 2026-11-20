// Homepage AI-tool count (Marketing wording, 20 Nov 2026): the "N AI tools
// checked" heading counts AI tools only (not the not_ai_tool row), and any
// all-rows total says how many are AI tools, matching llms.txt. Builds its own dist.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokensFrom, totalPhrase } from "../integrations/catalog-counts-core.mjs";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));
const total = tools.length;
const rated = tools.filter((t) => t.compliance_status !== "not_ai_tool").length;
const notAi = total - rated;

let dist, home, toolsIndex, llms;
before(() => {
  dist = mkdtempSync(join(tmpdir(), "pp-home-count-"));
  const env = { ...process.env }; delete env.PUBLIC_CF_BEACON_TOKEN;
  execFileSync("npx", ["astro", "build", "--outDir", dist], { cwd: FRONTEND, env, stdio: "pipe" });
  home = readFileSync(join(dist, "index.html"), "utf8");
  toolsIndex = readFileSync(join(dist, "tools/index.html"), "utf8");
  llms = readFileSync(join(dist, "llms.txt"), "utf8");
});
after(() => rmSync(dist, { recursive: true, force: true }));

test("homepage heading counts AI tools only", () => {
  assert.ok(notAi >= 1, "fixture expects at least one not_ai_tool row (hancocyber)");
  assert.match(home, new RegExp(`>${rated} AI tools? checked\\. Here`));
  assert.ok(!home.includes(`>${total} AI tools checked`), "homepage still counts the non-AI site as an AI tool");
});

test("totalPhrase matches llms.txt wording and numbers", () => {
  const phrase = totalPhrase(tokensFrom(tools));
  assert.equal(phrase, `${rated} AI tools rated, plus ${notAi} checked site${notAi === 1 ? " that isn't an AI tool" : "s that aren't AI tools"} (${total} in total)`);
  assert.ok(llms.includes(`${rated} AI tools rated`));
  assert.ok(llms.includes(`(${total} in total)`));
  assert.equal(totalPhrase({ RATED_COUNT: "5", COUNT_not_ai_tool: "0", TOOL_COUNT: "5" }), "5 AI tools rated");
});

test("/tools/ ItemList doesn't call every listed tool an AI tool", () => {
  const blocks = [...toolsIndex.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const list = blocks.flatMap((b) => (Array.isArray(b) ? b : [b])).find((b) => b["@type"] === "ItemList");
  assert.ok(list, "ItemList present");
  assert.equal(list.numberOfItems, total);
  assert.ok(!/AI tools/.test(list.name), `ItemList name "${list.name}" claims all ${total} are AI tools`);
  assert.equal(list.description, totalPhrase(tokensFrom(tools)));
});
