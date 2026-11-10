// MF9 verdict mirror refresh (box only). Run before each live day.
// Usage: PROD_TOOLS_AS_OF=<export time ISO> node --experimental-strip-types outreach/scripts/build-verdicts-sql.ts <tools-export.json> <gate-keys.txt> <out.sql>
// <tools-export.json> = a READ-ONLY export of policypeek-db (SELECT domain, name, compliance_status, source_urls FROM tools).
// <gate-keys.txt> = one card_gate.tool_slug per line (SELECT tool_slug FROM card_gate on the outreach DB).
// Writes UPDATE statements for live_verdict/verdict_as_of only. Applies nothing.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { verdictRefreshSql } from "../src/loader.ts";

const [, , toolsFile, keysFile, outFile] = process.argv;
if (!toolsFile || !keysFile || !outFile) { console.error("usage: build-verdicts-sql.ts <tools.json> <gate-keys.txt> <out.sql>"); process.exit(2); }
const dump = JSON.parse(readFileSync(toolsFile, "utf8"));
const tools = Array.isArray(dump) ? dump[0].results : dump.results;
const keys = readFileSync(keysFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const asOf = process.env.PROD_TOOLS_AS_OF ?? statSync(toolsFile).mtime.toISOString();
writeFileSync(outFile, verdictRefreshSql(keys, tools, asOf));
console.log(`verdict refresh: ${keys.length} gate rows, export as of ${asOf}`);
