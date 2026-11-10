// MF9/MF11 verdict mirror refresh SQL (box only). Generates, applies nothing.
// Usage: PROD_TOOLS_AS_OF=<ISO export time> node --experimental-strip-types outreach/scripts/build-verdicts-sql.ts <tools-export.json> <gate.json> <out.sql> [previousCount]
// <tools-export.json>: wrangler --json output of the READ-ONLY policypeek-db SELECT (see refresh-verdicts.ts).
// <gate.json>: wrangler --json output of refresh-verdicts.ts GATE_SQL (tool_slug, verdict_at_load, tool_name) on policypeek-outreach.
// Refuses (exit 1, no file written) on a short/partial export, unknown or empty verdicts, a missing known tool,
// or a missing/invalid PROD_TOOLS_AS_OF. There is no file-time fallback.
import { readFileSync, writeFileSync } from "node:fs";
import { requireAsOf, toolsFromExport, verdictRefreshSql, type GateRow } from "../src/loader.ts";

const [, , toolsFile, gateFile, outFile, prev] = process.argv;
if (!toolsFile || !gateFile || !outFile) { console.error("usage: build-verdicts-sql.ts <tools.json> <gate.json> <out.sql> [previousCount]"); process.exit(2); }
try {
  const asOf = requireAsOf(process.env.PROD_TOOLS_AS_OF);
  const tools = toolsFromExport(JSON.parse(readFileSync(toolsFile, "utf8")));
  const gate = toolsFromExport(JSON.parse(readFileSync(gateFile, "utf8"))) as unknown as GateRow[];
  const sql = verdictRefreshSql(gate, tools, asOf, { previousCount: prev ? Number(prev) : undefined });
  writeFileSync(outFile, sql);
  console.log(`verdict refresh: ${gate.length} gate rows, ${tools.length} catalog tools, export as of ${asOf}`);
} catch (e) {
  console.error(`REFUSED (nothing written; today's sends stay blocked): ${(e as Error).message}`);
  process.exit(1);
}
