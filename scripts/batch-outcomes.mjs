// Shows what happened to the tools the batch script submitted. batch_submissions.jsonl
// only records that a submission was accepted (HTTP 202); this joins it to the live
// review queue. It makes ONE read-only request to the live admin API, so YOU run it
// (agents don't touch production):
//
//   ADMIN_TOKEN=... node scripts/batch-outcomes.mjs
//
// Per submitted id it prints: approved (auto-published or approved), extracted (waiting
// in the queue, with the reason), pending or failed (with the recorded error).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.API_BASE ?? "https://api.getpolicypeek.com";
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Set ADMIN_TOKEN, e.g.  ADMIN_TOKEN=... node scripts/batch-outcomes.mjs");
  process.exit(2);
}

const submitted = readFileSync(join(REPO, "research/batch_submissions.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.pending_check_id);

const res = await fetch(`${API}/v1/admin/pending`, { headers: { "X-Admin-Token": token } });
if (!res.ok) { console.error(`Admin API returned HTTP ${res.status}`); process.exit(1); }
const { pending_checks: rows } = await res.json();
const byId = new Map(rows.map((r) => [r.id, r]));

for (const s of submitted) {
  const row = byId.get(s.pending_check_id);
  if (!row) { console.log(`#${s.pending_check_id} ${s.domain}: not in the queue listing`); continue; }
  const why = row.queue_reason ?? row.extraction_error ?? "";
  console.log(`#${row.id} ${row.domain}: ${row.status}${why ? ` -- ${why}` : ""}`);
}
