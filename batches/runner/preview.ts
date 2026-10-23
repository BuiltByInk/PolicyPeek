// LOCAL preview: runs the REAL submit pipeline (handleCheck -> fetchPolicyText -> cleanHtmlToText ->
// runExtraction -> extractFacts -> computeVerdict -> evaluateAutoPublish -> publish/queue) from
// backend/src against the LIVE policy pages, with an in-memory SQLite stand-in for D1. Nothing
// touches production. Needs ANTHROPIC_API_KEY in the environment for the extraction step; without
// it the fetch/clean/host-rule stages still run and extraction is reported as failed (HOLD).
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { handleCheck } from "../../backend/src/check";
import { computeVerdict } from "../../backend/src/rules";
import { isKnownSharedDomain } from "../../backend/src/sharedDomains";

const BACKEND = process.env.BACKEND ?? new URL("../../backend", import.meta.url).pathname;
const HERE = process.env.HERE ?? (() => { throw new Error("set HERE=<batch dir> (use run-preview.sh / run-prod.sh <batch dir>)"); })();
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(`${BACKEND}/schema.sql`, "utf8"));

function stmt(sql: string) {
  let args: unknown[] = [];
  const s = {
    bind(...a: unknown[]) { args = a.map((v) => (typeof v === "boolean" ? Number(v) : v === undefined ? null : v)); return s; },
    async first(col?: string) { const r = db.prepare(sql).get(...(args as any[])) as any; return r ? (col ? r[col] : r) : null; },
    async all() { return { results: db.prepare(sql).all(...(args as any[])), success: true, meta: {} }; },
    async run() {
      if (/\bRETURNING\b/i.test(sql)) { const rows = db.prepare(sql).all(...(args as any[])); return { results: rows, success: true, meta: { changes: rows.length } }; }
      const r = db.prepare(sql).run(...(args as any[])); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  };
  return s;
}
const localKey = randomBytes(16).toString("hex");
db.prepare("INSERT INTO api_keys (key_hash, tier, label) VALUES (?, 'paid', 'local-preview')").run(createHash("sha256").update(localKey).digest("hex"));
const env = { DB: { prepare: stmt, batch: async (xs: any[]) => Promise.all(xs.map((x) => x.run())) }, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "missing" } as any;

const tools = JSON.parse(readFileSync(`${HERE}/tools.json`, "utf8"));
const out: any[] = [];
for (const t of tools) {
  const r: any = { domain: t.domain, intended: t.badge, shared_domain_rule: isKnownSharedDomain(t.domain) };
  if (t.hold) { out.push({ ...r, decision: "HOLD", why: t.hold }); continue; }
  const waits: Promise<unknown>[] = [];
  const req = new Request("https://local/v1/check", { method: "POST", headers: { "content-type": "application/json", "X-Api-Key": localKey, "CF-Connecting-IP": "127.0.0.1" }, body: JSON.stringify({ domain: t.domain, source_url: t.source_url, name: t.name }) });
  const res = await handleCheck(req, env, { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as any);
  r.http = res.status;
  const body: any = await res.json().catch(() => ({}));
  await Promise.allSettled(waits);
  if (res.status !== 202) { out.push({ ...r, decision: "HOLD", why: `submit rejected: ${JSON.stringify(body)}` }); continue; }
  const p: any = db.prepare("SELECT status, extracted_facts, extraction_error, sourced_from_archive, length(raw_fetch) AS chars FROM pending_checks WHERE id = ?").get(body.pending_check_id);
  const tool: any = db.prepare("SELECT compliance_status FROM tools WHERE domain = ?").get(t.domain);
  r.page_chars = p.chars; r.archive = !!p.sourced_from_archive;
  if (!p.extracted_facts) { out.push({ ...r, decision: "HOLD", why: `extraction failed: ${String(p.extraction_error).slice(0, 160)}` }); continue; }
  const facts = JSON.parse(p.extracted_facts);
  r.facts = { trains: facts.trains_on_user_data, opt_out: facts.opt_out_available };
  r.extracted_verdict = computeVerdict(facts, { sharedDomain: r.shared_domain_rule });
  r.pipeline_would = tool ? `auto-publish as ${tool.compliance_status}` : `queue: ${p.extraction_error ?? "(no note)"}`;
  r.decision = r.extracted_verdict === t.badge ? "AGREE" : "HOLD";
  if (r.decision === "HOLD") r.why = `extraction says ${r.extracted_verdict}, table says ${t.badge}`;
  out.push(r);
}
writeFileSync(`${HERE}/preview-result.json`, JSON.stringify({ ran_at: new Date().toISOString(), extraction: process.env.ANTHROPIC_API_KEY ? "real" : "skipped (no ANTHROPIC_API_KEY)", results: out }, null, 1));
for (const r of out) console.log(`${r.decision.padEnd(5)} ${r.domain.padEnd(22)} intended=${r.intended} extracted=${r.extracted_verdict ?? "-"} ${r.why ?? r.pipeline_would ?? ""}`);
