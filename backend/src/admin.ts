import type { Env } from "./index";
import type { ExtractedFacts } from "./extraction";
import { computeVerdict } from "./rules";

interface PendingCheckRow {
  id: number;
  domain: string;
  is_recheck: number;
  status: string;
  source_url: string | null;
  extracted_facts: string | null;
  shared_domain: number;
}

interface ToolRow {
  id: number;
  compliance_status: string;
}

export async function handleListPending(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, domain, is_recheck, status, source_url, shared_domain, created_at, updated_at FROM pending_checks ORDER BY created_at DESC"
  ).all();
  return Response.json({ pending_checks: results });
}

export async function handleApprove(request: Request, env: Env, id: number): Promise<Response> {
  const pending = await env.DB.prepare(
    "SELECT id, domain, is_recheck, status, source_url, extracted_facts, shared_domain FROM pending_checks WHERE id = ?"
  )
    .bind(id)
    .first<PendingCheckRow>();

  if (!pending) {
    return Response.json({ error: "pending_check_not_found" }, { status: 404 });
  }
  if (!pending.extracted_facts) {
    return Response.json({ error: "not_yet_extracted" }, { status: 400 });
  }

  const facts = JSON.parse(pending.extracted_facts) as ExtractedFacts;
  const sharedDomain = pending.shared_domain === 1;
  const verdict = computeVerdict(facts, { sharedDomain });
  const summary = sharedDomain
    ? "Policy text is shared across multiple company products — not verified as specific to this tool."
    : facts.relevant_clauses[0] ?? null;
  const sourceUrls = JSON.stringify(pending.source_url ? [pending.source_url] : []);

  const existing = await env.DB.prepare("SELECT id, compliance_status FROM tools WHERE domain = ?")
    .bind(pending.domain)
    .first<ToolRow>();

  let toolId: number;
  if (existing) {
    // Resubmission path: a domain that already has a rating gets updated in
    // place instead of dead-ending on a duplicate-domain conflict.
    await env.DB.prepare(
      `UPDATE tools SET compliance_status = ?, data_retention = ?, trains_on_user_data = ?, gdpr_mentioned = ?,
        source_urls = ?, verified = 1, summary = ?, shared_domain = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`
    )
      .bind(
        verdict,
        facts.data_retention,
        facts.trains_on_user_data === null ? null : Number(facts.trains_on_user_data),
        facts.gdpr_mentioned === null ? null : Number(facts.gdpr_mentioned),
        sourceUrls,
        summary,
        Number(sharedDomain),
        existing.id
      )
      .run();
    toolId = existing.id;
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO tools (name, domain, compliance_status, data_retention, trains_on_user_data, gdpr_mentioned, source_urls, verified, summary, shared_domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING id`
    )
      .bind(
        pending.domain,
        pending.domain,
        verdict,
        facts.data_retention,
        facts.trains_on_user_data === null ? null : Number(facts.trains_on_user_data),
        facts.gdpr_mentioned === null ? null : Number(facts.gdpr_mentioned),
        sourceUrls,
        summary,
        Number(sharedDomain)
      )
      .first<{ id: number }>();
    if (!inserted) return Response.json({ error: "insert_failed" }, { status: 500 });
    toolId = inserted.id;
  }

  // Explicit log entry in addition to whatever the DB trigger already wrote —
  // last build's changelog history got lost when a trigger silently didn't
  // fire, so approval doesn't rely on the trigger alone.
  await env.DB.prepare(
    "INSERT INTO compliance_changelog (tool_id, old_status, new_status, note) VALUES (?, ?, ?, ?)"
  )
    .bind(toolId, existing?.compliance_status ?? null, verdict, `approved from pending_check #${id}`)
    .run();

  await env.DB.prepare(
    "UPDATE pending_checks SET status = 'approved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  )
    .bind(id)
    .run();

  return Response.json({ tool_id: toolId, domain: pending.domain, compliance_status: verdict });
}

export async function handleReject(request: Request, env: Env, id: number): Promise<Response> {
  const result = await env.DB.prepare(
    "UPDATE pending_checks SET status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status != 'approved'"
  )
    .bind(id)
    .run();

  if (result.meta.changes === 0) {
    return Response.json({ error: "pending_check_not_found_or_already_approved" }, { status: 404 });
  }
  return Response.json({ pending_check_id: id, status: "rejected" });
}
