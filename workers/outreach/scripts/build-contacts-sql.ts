// Usage (box only): node --experimental-strip-types outreach/scripts/build-contacts-sql.ts <out-dir>
// Writes contacts.sql + load-report.md. Does NOT apply anything to any database.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildLoad, parseCsv, parseHeldPack, parseRecheck, toSql } from "../src/loader.ts";

const HELD = "/workspace/deliverables/policypeek/held-outreach";
const FLAGS = "/workspace/deliverables/research/ambiguous-cards-2026-11-10.csv";
const RECHECK = "/workspace/deliverables/research/recheck-2026-11-10.md";
const out = process.argv[2] ?? "out";
mkdirSync(out, { recursive: true });
const toolsDump = JSON.parse(readFileSync(process.env.PROD_TOOLS_JSON ?? "/tmp/prod-tools.json", "utf8"));
const liveTools = (Array.isArray(toolsDump) ? toolsDump[0].results : toolsDump.results).filter((t: any) => t.compliance_status !== "held");
const r = buildLoad({
  tracker: parseCsv(readFileSync(`${HELD}/tracker.csv`, "utf8")),
  heldPack: parseHeldPack(readFileSync(`${HELD}/held-outreach-2026-11-10.md`, "utf8")),
  liveTools,
  flagCsv: existsSync(FLAGS) ? parseCsv(readFileSync(FLAGS, "utf8")) : null,
  recheck: existsSync(RECHECK) ? parseRecheck(readFileSync(RECHECK, "utf8")) : null,
  vettedBy: "dev-loader (Security gate 2 rules)",
});
const vettedAt = new Date().toISOString();
writeFileSync(`${out}/contacts.sql`, toSql(r, "dev-loader (Security gate 2 rules)", vettedAt));
const md = [
  `# Outreach contact load report (${vettedAt})`, "", "Not applied to any database.", "",
  "## Counts", "", ...Object.entries(r.counts).map(([k, v]) => `- ${k}: ${v}`), `- live tools in dump: ${liveTools.length}`, "",
  "## Loadable contacts (all still behind kill switch, paused flag and card gate)", "", "| tool_slug | kind | contact | source | status | card gate |", "|---|---|---|---|---|---|",
  ...r.contacts.map((c) => { const g = r.cardGate.find((x) => x.tool_slug === c.tool_slug)!; return `| ${c.tool_slug} | ${c.kind} | ${c.contact_email} | ${c.contact_source_url} | ${c.status}${c.paused_reason ? ` (${c.paused_reason})` : ""} | ${g.gate_reason} |`; }), "",
  "## Dropped / skipped", "", "| tool | kind | contact | reason |", "|---|---|---|---|", ...r.skipped.map((s) => `| ${s.tool} | ${s.kind} | ${s.contact} | ${s.reason} |`), "",
  "## Card gate (all tools)", "", `pass: ${r.cardGate.filter((g) => g.passes).length}, blocked: ${r.cardGate.filter((g) => !g.passes).length}`, "", "| tool_slug | flagged | gate |", "|---|---|---|", ...r.cardGate.map((g) => `| ${g.tool_slug} | ${g.flagged} | ${g.gate_reason} |`), "",
];
writeFileSync(`${out}/load-report.md`, md.join("\n"));
console.log(JSON.stringify(r.counts), "contacts", r.contacts.length, "gate", r.cardGate.length);
