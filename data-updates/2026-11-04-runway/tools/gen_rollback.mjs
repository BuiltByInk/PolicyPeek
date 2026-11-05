#!/usr/bin/env node
// Rollback SQL from the LIVE before-snapshot in apply-output.json (wrangler d1 execute --json output).
// Usage: node tools/gen_rollback.mjs apply-output.json > rollback.sql
// Restores runway.com column by column and removes the changelog row(s) the apply's update trigger wrote.
import { readFileSync } from "node:fs";
const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sets = (Array.isArray(out) ? out : [out]).flatMap((r) => (r && Array.isArray(r.results) ? [r.results] : []));
const snap = sets.find((rows) => rows.length && rows[0].snapshot === "before_snapshot") ?? [];
if (snap.length !== 1) { console.error(`expected 1 before_snapshot row, got ${snap.length}`); process.exit(1); }
const r = snap[0];
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replaceAll("'", "''") + "'");
const c = Object.keys(r).filter((k) => !["snapshot", "id", "domain", "created_at"].includes(k));
console.log(`-- Rollback generated ${new Date().toISOString()} from the live before-snapshot. Run as one --file batch.`);
console.log(`UPDATE tools SET ${c.map((k) => `${k} = ${lit(r[k])}`).join(", ")} WHERE id = ${r.id} AND domain = 'runway.com';`);
console.log(`DELETE FROM compliance_changelog WHERE tool_id = ${r.id} AND old_status = 'unrated' AND new_status = 'not_compliant' AND note = 'trigger: update';`);
console.log(`DELETE FROM compliance_changelog WHERE tool_id = ${r.id} AND old_status = 'not_compliant' AND new_status = 'unrated' AND note = 'trigger: update';`);
console.log(`SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'runway.com' AND compliance_status = 'unrated') = 1 AND (SELECT COUNT(*) FROM tools) = 61 THEN 'ok: rolled back' ELSE json('ROLLBACK ASSERT FAILED') END AS assert_rollback;`);
