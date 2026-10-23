// PRODUCTION steps, dry-run by default; add --go to send. Run only after the badge batch is applied
// and the manual-override backend is deployed (README). Credentials come from env only.
//   submit   POLICYPEEK_API_KEY  POST /v1/check for tools whose LOCAL preview said AGREE
//   review   ADMIN_TOKEN         read /v1/admin/pending + /v1/lookup; recompute the verdict from the
//                                PRODUCTION extracted facts with the real computeVerdict; writes review-result.json
//   approve  ADMIN_TOKEN         approve only rows review marked APPROVE (verdict == intended)
//   pin-sql  (none)              writes pin.sql for tools live with the intended badge
import { readFileSync, writeFileSync } from "node:fs";
import { computeVerdict } from "../../backend/src/rules";

const HERE = process.env.HERE ?? (() => { throw new Error("set HERE=<batch dir> (use run-preview.sh / run-prod.sh <batch dir>)"); })();
const API = process.env.POLICYPEEK_API_BASE ?? "https://api.getpolicypeek.com";
const [cmd] = process.argv.slice(2);
const GO = process.argv.includes("--go");
const tools: any[] = JSON.parse(readFileSync(`${HERE}/tools.json`, "utf8"));
const byDomain = new Map(tools.map((t) => [t.domain, t]));
const need = (k: string) => { const v = process.env[k]; if (!v) { console.error(`${k} not set`); process.exit(2); } return v; };
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";

if (cmd === "submit") {
  const prev = JSON.parse(readFileSync(`${HERE}/preview-result.json`, "utf8"));
  if (prev.extraction !== "real") { console.error("preview-result.json was produced without real extraction; rerun run-preview.sh with ANTHROPIC_API_KEY"); process.exit(1); }
  const agree = prev.results.filter((r: any) => r.decision === "AGREE").map((r: any) => byDomain.get(r.domain));
  for (const r of prev.results.filter((r: any) => r.decision !== "AGREE")) console.log(`HOLD   ${r.domain}: ${r.why}`);
  const key = GO ? need("POLICYPEEK_API_KEY") : "";
  for (const t of agree) {
    if (!GO) { console.log(`WOULD SUBMIT ${t.domain} ${t.source_url}`); continue; }
    const res = await fetch(`${API}/v1/check`, { method: "POST", headers: { "content-type": "application/json", "X-Api-Key": key }, body: JSON.stringify({ domain: t.domain, source_url: t.source_url, name: t.name, hold_for_review: true }) });
    console.log(`${res.status} ${t.domain} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
} else if (cmd === "review" || cmd === "approve") {
  const admin = need("ADMIN_TOKEN");
  const pending: any = await (await fetch(`${API}/v1/admin/pending`, { headers: { "X-Admin-Token": admin } })).json();
  const rows: any[] = Array.isArray(pending) ? pending : pending.pending_checks ?? [];
  const out: any[] = [];
  for (const t of tools.filter((t) => !t.hold)) {
    const live: any = await (await fetch(`${API}/v1/lookup?domain=${encodeURIComponent(t.domain)}`)).json().catch(() => ({}));
    const liveExact = live?.matched_domain === t.domain ? live.compliance_status : null;
    const row = rows.filter((r) => r.domain === t.domain && r.status === "extracted").sort((a, b) => b.id - a.id)[0];
    const facts = row?.extracted_facts ? (typeof row.extracted_facts === "string" ? JSON.parse(row.extracted_facts) : row.extracted_facts) : null;
    const v = facts ? computeVerdict(facts, { sharedDomain: !!row.shared_domain }) : null;
    let action = "HOLD", why = "";
    if (liveExact) { action = liveExact === t.badge ? "LIVE_OK" : "LIVE_MISMATCH"; why = `already published as ${liveExact} (auto-publish)`; }
    else if (!row) why = "no extracted pending row (submission missing or extraction failed)";
    else if (v !== t.badge) why = `production extraction says ${v}, intended ${t.badge}`;
    else { action = "APPROVE"; why = `production extraction agrees (${v}); queued because: ${row.queue_reason ?? row.extraction_error}`; }
    out.push({ domain: t.domain, intended: t.badge, pending_id: row?.id ?? null, production_verdict: v, live: liveExact, action, why });
  }
  writeFileSync(`${HERE}/review-result.json`, JSON.stringify(out, null, 1));
  for (const r of out) console.log(`${r.action.padEnd(13)} ${r.domain.padEnd(14)} ${r.why}`);
  if (cmd === "approve") for (const r of out.filter((r) => r.action === "APPROVE")) {
    if (!GO) { console.log(`WOULD APPROVE pending ${r.pending_id} (${r.domain})`); continue; }
    const res = await fetch(`${API}/v1/admin/pending/${r.pending_id}/approve`, { method: "POST", headers: { "X-Admin-Token": admin } });
    console.log(`${res.status} approve ${r.pending_id} ${r.domain} ${await res.text()}`);
  }
} else if (cmd === "pin-sql") {
  const rev: any[] = JSON.parse(readFileSync(`${HERE}/review-result.json`, "utf8"));
  const pin = rev.filter((r) => r.action === "APPROVE" || r.action === "LIVE_OK").map((r) => byDomain.get(r.domain));
  const inl = pin.map((t) => q(t.domain)).join(", ") || "NULL";
  let s = `-- Pins the table summaries for newly published tools (run AFTER approve; re-run 'review' first so APPROVE rows are live).
-- One atomic batch (D1 --file); the ASSERT errors and rolls everything back if any row is not at its intended badge.
SELECT 'before_snapshot' AS snapshot, id, domain, compliance_status, summary, auto_published, manual_override, updated_at FROM tools WHERE domain IN (${inl});
`;
  for (const t of pin) s += `UPDATE tools SET summary = ${q(t.summary)}, manual_override = 1, auto_published = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE domain = ${q(t.domain)} AND compliance_status = ${q(t.badge)};\n`;
  s += `SELECT 'after' AS v, domain, compliance_status, manual_override, summary FROM tools WHERE domain IN (${inl});
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN (${inl}) AND manual_override = 1) = ${pin.length} THEN 'ok: ${pin.length} pinned' ELSE json('ASSERT FAILED: a tool is not at its intended badge') END AS assert_pinned;
`;
  writeFileSync(`${HERE}/pin.sql`, s);
  console.log(`wrote pin.sql for: ${pin.map((t) => t.domain).join(", ") || "(none)"}`);
} else { console.error("usage: run-prod.sh submit|review|approve|pin-sql [--go]"); process.exit(2); }
