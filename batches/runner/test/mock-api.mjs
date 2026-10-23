// Local mock of the production API for testing run-prod.sh (no network to prod).
import http from "node:http";
const F = (t, o) => JSON.stringify({ trains_on_user_data: t, opt_out_available: o, data_retention: null, gdpr_mentioned: null, relevant_clauses: [] });
const pending = [
  { id: 11, domain: "deepseek.com", status: "extracted", shared_domain: 0, extracted_facts: F(true, true), queue_reason: "brand-new domain with a favourable verdict" },
  { id: 12, domain: "lovable.dev", status: "extracted", shared_domain: 0, extracted_facts: F(true, null), queue_reason: "opt_out_available is null" },
  { id: 13, domain: "tabnine.com", status: "extracted", shared_domain: 0, extracted_facts: F(false, null), queue_reason: "source on docs.tabnine.com" },
];
const live = { "suno.com": "not_compliant" };
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/v1/admin/pending") { if (req.headers["x-admin-token"] !== "test") { res.writeHead(401).end(); return; } res.end(JSON.stringify({ pending_checks: pending })); return; }
  if (u.pathname === "/v1/lookup") { const d = u.searchParams.get("domain"); if (live[d]) res.end(JSON.stringify({ matched_domain: d, compliance_status: live[d] })); else { res.writeHead(404); res.end(JSON.stringify({ error: "not_found" })); } return; }
  if (/\/approve$/.test(u.pathname)) { res.end(JSON.stringify({ approved: u.pathname })); return; }
  res.writeHead(404).end();
}).listen(8799, () => console.log("mock on 8799"));
