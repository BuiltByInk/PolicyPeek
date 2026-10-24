#!/usr/bin/env node
// Builds rollback SQL from the LIVE before-snapshot in apply-output.json (wrangler d1 execute --json output).
// Usage: node tools/gen_rollback.mjs apply-output.json > rollback.sql
// Held rerun: every target row is INSERTED, so the rollback deletes them (plus their trigger-written changelog rows).
// Adapted from deliverables/data-update-2026-10: also deletes INSERTED_DOMAINS rows that the snapshot shows were absent.
import { readFileSync } from "node:fs";
const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sets = (Array.isArray(out) ? out : [out]).flatMap((r) => (r && Array.isArray(r.results) ? [r.results] : []));
// The snapshot is the FIRST statement in apply.sql. Here it is normally empty (all rows are new), and an
// empty result set carries no 'snapshot' column, so fall back to position when it is empty.
const snap = sets.find((rows) => rows.length && rows[0].snapshot === "before_snapshot") ?? (sets[0] && sets[0].length === 0 ? [] : undefined);
if (!snap) { console.error("no before_snapshot result set found"); process.exit(1); }
// An empty snapshot comes back as an empty result set; find it by position instead if needed.
const COLS = ["compliance_status","trains_on_user_data","opt_out_available","summary","source_urls","sourced_from_archive","auto_published","manual_override","last_checked_at","last_check_note","updated_at"];
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replaceAll("'", "''") + "'");
console.log(`-- Rollback generated ${new Date().toISOString()} from the live before-snapshot (${snap.length} rows). Run as one --file batch.`);
const INSERTED_DOMAINS = JSON.parse(readFileSync(new URL("./inserted_domains.json", import.meta.url), "utf8"));
const present = new Set(snap.map((r) => r.domain));
for (const d of INSERTED_DOMAINS) if (!present.has(d)) console.log(`-- ${d} was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.\nDELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = ${lit(d)} AND manual_override = 1);\nDELETE FROM tools WHERE domain = ${lit(d)} AND manual_override = 1;`);
for (const r of snap) console.log(`UPDATE tools SET ${COLS.map((c) => `${c} = ${lit(r[c])}`).join(", ")} WHERE id = ${r.id} AND domain = ${lit(r.domain)};`);
console.log(`SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE manual_override = 1 AND id IN (${snap.filter((r) => !r.manual_override).map((r) => r.id).join(",") || "NULL"})) = 0 THEN 'ok: rolled back' ELSE json('ROLLBACK ASSERT FAILED') END AS assert_rollback;`);
