// Node wrapper: reads tools.json from the repo. Used by the Vite plugin and tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tokensFrom, applyCountsWith } from "./catalog-counts-core.mjs";

const tools = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../data/tools.json"), "utf8"));

export const catalogToolCount = tools.length;
export const catalogRatedCount = tools.filter((t) => t.compliance_status !== "not_ai_tool").length;
export const COUNT_TOKENS = tokensFrom(tools);
export const applyCounts = (s) => applyCountsWith(COUNT_TOKENS, s);
