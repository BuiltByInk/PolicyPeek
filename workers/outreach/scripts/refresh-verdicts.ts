// MF9/MF11 daily verdict refresh. Box job, designed to run automatically each
// live day at ~07:30 UTC, before the 09:00 UTC sender cron. NOT scheduled and
// NOT run yet (needs Elliot's standing approval for the read-only SELECT on
// policypeek-db and a named owner).
//
// Steps (all or nothing):
//  1. Record the export time T, then a READ-ONLY export of policypeek-db with a
//     fixed SELECT (never --file, never a write).
//  2. Read card_gate (tool_slug, verdict_at_load) and the last good catalog
//     count from policypeek-outreach (fixed SELECTs).
//  3. Validate and build the UPDATE SQL (loader.verdictRefreshSql): refuses a
//     short export, any missing/unknown/empty verdict, duplicate keys, or a
//     missing known tool, or an 'unpublished' tool that may now be
//     published under another key (MF12).
//  4. Only with --apply: write the UPDATEs (live_verdict, verdict_as_of = T)
//     and the new catalog count to policypeek-outreach. Nothing else.
// Fail closed: if ANY step fails, nothing is written. The sender requires the
// mirror to be refreshed the SAME UTC DAY, so that day nothing sends.
//
// Usage:
//   node --experimental-strip-types outreach/scripts/refresh-verdicts.ts            # plan only: prints commands, runs nothing
//   node --experimental-strip-types outreach/scripts/refresh-verdicts.ts --apply    # runs steps 1-4 (prod)
//   PROD_TOOLS_AS_OF=<ISO> node ... refresh-verdicts.ts --export-file x.json --gate-file g.json --out out.sql   # offline build only
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireAsOf, toolsFromExport, verdictRefreshSql, type GateRow } from "../src/loader.ts";

export const EXPORT_SQL = "SELECT domain, name, compliance_status, source_urls FROM tools ORDER BY domain, name";
export const GATE_SQL = "SELECT g.tool_slug, g.verdict_at_load, (SELECT c.tool_name FROM outreach_contacts c WHERE c.tool_slug = g.tool_slug LIMIT 1) AS tool_name FROM card_gate g ORDER BY g.tool_slug";
export const PREV_SQL = "SELECT value FROM outreach_settings WHERE key = 'catalog_tools_count'";
const W = ["wrangler"];
const EXPORT_CMD = [...W, "d1", "execute", "policypeek-db", "--remote", "--json", "--command", EXPORT_SQL]; // run in ../backend (its wrangler.toml binds policypeek-db)
const OUTREACH = ["--remote", "--env", "production", "-c", "outreach/wrangler.jsonc"];
const GATE_CMD = [...W, "d1", "execute", "policypeek-outreach", ...OUTREACH, "--json", "--command", GATE_SQL];
const PREV_CMD = [...W, "d1", "execute", "policypeek-outreach", ...OUTREACH, "--json", "--command", PREV_SQL];
const applyCmd = (file: string) => [...W, "d1", "execute", "policypeek-outreach", ...OUTREACH, "--file", file];

const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const npx = (cmd: string[], cwd: string) => execFileSync("npx", cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 120_000 });

function fail(msg: string): never {
  console.error(JSON.stringify({ event: "verdict_refresh_refused", alert: true, reason: msg.slice(0, 300), effect: "mirror not refreshed today => no outreach sends today" }));
  process.exit(1);
}

try {
  if (flag("--export-file")) {
    // Offline build from files: the export time must be given explicitly.
    const asOf = requireAsOf(process.env.PROD_TOOLS_AS_OF);
    const tools = toolsFromExport(JSON.parse(readFileSync(flag("--export-file")!, "utf8")));
    const gate = toolsFromExport(JSON.parse(readFileSync(flag("--gate-file") ?? "", "utf8"))) as unknown as GateRow[];
    writeFileSync(flag("--out") ?? "verdicts.sql", verdictRefreshSql(gate, tools, asOf));
    console.log("built (offline), nothing applied");
  } else if (!args.includes("--apply")) {
    console.log("PLAN ONLY (nothing run). With --apply this job runs, in order:");
    for (const c of [["(cwd ../backend)", ...EXPORT_CMD], GATE_CMD, PREV_CMD, applyCmd("<validated verdicts.sql>")]) console.log("  npx " + c.join(" "));
  } else {
    const workers = process.cwd();
    // T = the moment just before the read-only export (explicit, never a file time).
    const asOf = requireAsOf(new Date().toISOString()) // live mode: clock time captured just before the export, never an env override or file time;
    const tools = toolsFromExport(JSON.parse(npx(EXPORT_CMD, join(workers, "../backend"))));
    const gate = toolsFromExport(JSON.parse(npx(GATE_CMD, workers))) as unknown as GateRow[];
    const prevRows = toolsFromExport(JSON.parse(npx(PREV_CMD, workers))) as unknown as { value: string }[];
    const previousCount = prevRows[0] ? Number(prevRows[0].value) : undefined;
    if (previousCount !== undefined && !Number.isFinite(previousCount)) fail("bad catalog_tools_count in outreach_settings");
    const sql = verdictRefreshSql(gate, tools, asOf, { previousCount }) +
      `INSERT INTO outreach_settings (key, value) VALUES ('catalog_tools_count', '${tools.length}') ON CONFLICT (key) DO UPDATE SET value = excluded.value;\n`;
    const dir = mkdtempSync(join(tmpdir(), "pp-verdicts-"));
    const file = join(dir, "verdicts.sql");
    writeFileSync(file, sql);
    npx(applyCmd(file), workers);
    console.log(JSON.stringify({ event: "verdict_refresh_ok", as_of: asOf, catalog_tools: tools.length, gate_rows: gate.length }));
  }
} catch (e) {
  fail((e as Error).message);
}
