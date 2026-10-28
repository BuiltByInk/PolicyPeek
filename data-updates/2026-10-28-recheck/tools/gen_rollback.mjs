#!/usr/bin/env node
// Builds rollback SQL from the LIVE before-snapshot in apply-output.json (wrangler d1 execute --json output).
// Usage: node tools/gen_rollback.mjs apply-output.json > rollback.sql
// Restores perplexity.ai and notion.com column by column, re-inserts mailchimp.com with its original id,
// then re-inserts its changelog rows with their original ids (after the row, so the insert trigger's extra
// changelog row is removed again).
import { readFileSync } from "node:fs";
const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sets = (Array.isArray(out) ? out : [out]).flatMap((r) => (r && Array.isArray(r.results) ? [r.results] : []));
const find = (tag) => sets.find((rows) => rows.length && rows[0].snapshot === tag) ?? [];
const snap = find("before_snapshot");
const log = find("before_changelog");
if (snap.length !== 3) { console.error(`expected 3 before_snapshot rows, got ${snap.length}`); process.exit(1); }
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : "'" + String(v).replaceAll("'", "''") + "'");
const cols = (r) => Object.keys(r).filter((c) => c !== "snapshot");
console.log(`-- Rollback generated ${new Date().toISOString()} from the live before-snapshot. Run as one --file batch.`);
for (const r of snap) {
  if (r.domain === "mailchimp.com") {
    const c = cols(r);
    console.log(`INSERT INTO tools (${c.join(", ")}) SELECT ${c.map((k) => lit(r[k])).join(", ")} WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'mailchimp.com');`);
    console.log(`DELETE FROM compliance_changelog WHERE tool_id = ${r.id} AND note = 'trigger: insert' AND id NOT IN (${log.map((l) => l.id).join(",") || "NULL"});`);
    for (const l of log) { const lc = cols(l); console.log(`INSERT OR IGNORE INTO compliance_changelog (${lc.join(", ")}) VALUES (${lc.map((k) => lit(l[k])).join(", ")});`); }
  } else {
    const c = cols(r).filter((k) => !["id", "domain", "created_at"].includes(k));
    console.log(`UPDATE tools SET ${c.map((k) => `${k} = ${lit(r[k])}`).join(", ")} WHERE id = ${r.id} AND domain = ${lit(r.domain)};`);
  }
}
console.log(`-- Note: the status UPDATE above fires trg_tools_changelog_on_update for perplexity.ai; that audit row is kept on purpose.`);
console.log(`SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'mailchimp.com') = 1 AND (SELECT COUNT(*) FROM tools) = 59 THEN 'ok: rolled back' ELSE json('ROLLBACK ASSERT FAILED') END AS assert_rollback;`);
