#!/usr/bin/env node
// Builds rollback SQL from the LIVE before-snapshot in apply-output.json (wrangler d1 execute --json output).
// Usage: node tools/gen_rollback.mjs apply-output.json > rollback.sql
// Restores the 9 updated rows column by column, re-inserts the 9 held tools with their original ids, then
// re-inserts their changelog rows with original ids (removing the insert trigger's extra rows).
import { readFileSync } from "node:fs";
const HELD = ["copy.ai", "jasper.ai", "replit.com", "runway.com", "stability.ai", "cursor.com", "windsurf.com", "midjourney.com", "otter.ai"];
const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sets = (Array.isArray(out) ? out : [out]).flatMap((r) => (r && Array.isArray(r.results) ? [r.results] : []));
const find = (tag) => sets.find((rows) => rows.length && rows[0].snapshot === tag) ?? [];
const snap = find("before_snapshot");
const log = find("before_changelog");
const total = find("before_counts").reduce((n, r) => n + r.n, 0);
if (snap.length !== 18) { console.error(`expected 18 before_snapshot rows, got ${snap.length}`); process.exit(1); }
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replaceAll("'", "''") + "'");
const cols = (r) => Object.keys(r).filter((c) => c !== "snapshot");
console.log(`-- Rollback generated ${new Date().toISOString()} from the live before-snapshot. Run as one --file batch.`);
for (const r of snap) {
  if (HELD.includes(r.domain)) {
    const c = cols(r);
    const mine = log.filter((l) => l.tool_id === r.id);
    console.log(`INSERT INTO tools (${c.join(", ")}) SELECT ${c.map((k) => lit(r[k])).join(", ")} WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = ${lit(r.domain)});`);
    console.log(`DELETE FROM compliance_changelog WHERE tool_id = ${r.id} AND id NOT IN (${mine.map((l) => l.id).join(",") || "NULL"});`);
    for (const l of mine) { const lc = cols(l); console.log(`INSERT OR IGNORE INTO compliance_changelog (${lc.join(", ")}) VALUES (${lc.map((k) => lit(l[k])).join(", ")});`); }
  } else {
    const c = cols(r).filter((k) => !["id", "domain", "created_at"].includes(k));
    console.log(`UPDATE tools SET ${c.map((k) => `${k} = ${lit(r[k])}`).join(", ")} WHERE id = ${r.id} AND domain = ${lit(r.domain)};`);
  }
}
console.log(`-- Note: a status UPDATE above (github.com, if it changed) fires trg_tools_changelog_on_update; that audit row is kept on purpose.`);
console.log(`SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN (${HELD.map(lit).join(", ")})) = 9 AND (SELECT COUNT(*) FROM tools) = ${total} THEN 'ok: rolled back' ELSE json('ROLLBACK ASSERT FAILED') END AS assert_rollback;`);
