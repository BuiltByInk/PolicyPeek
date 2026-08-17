import type { Env } from "./index";
import type { ExtractedFacts } from "./extraction";
import { computeVerdict } from "./rules";
import { evaluateAutoPublish } from "./autoPublish";

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
    "SELECT id, domain, is_recheck, status, source_url, extracted_facts, extraction_error, shared_domain, created_at, updated_at FROM pending_checks ORDER BY created_at DESC"
  ).all<PendingCheckRow & { extraction_error: string | null }>();

  // Annotate every still-queued, already-extracted row with *why* it wasn't
  // auto-published, so admin approval is confirming a specific flagged
  // reason instead of re-deriving it from raw facts each time.
  const annotated = await Promise.all(
    results.map(async (row) => {
      if (row.status !== "extracted" || !row.extracted_facts) return row;
      const facts = JSON.parse(row.extracted_facts) as ExtractedFacts;
      const existing = row.is_recheck
        ? await env.DB.prepare("SELECT compliance_status FROM tools WHERE domain = ?")
            .bind(row.domain)
            .first<{ compliance_status: string }>()
        : null;
      const result = evaluateAutoPublish(facts, {
        sharedDomain: row.shared_domain === 1,
        isRecheck: row.is_recheck === 1,
        existingStatus: existing?.compliance_status as ReturnType<typeof computeVerdict> | undefined,
      });
      return { ...row, queue_reason: result.reason };
    })
  );

  return Response.json({ pending_checks: annotated });
}

// Shared by the human-driven /approve endpoint and the automatic tier-A
// publish path in check.ts -- one place writes tools + changelog +
// pending_checks status, so "approved" always means the same thing
// regardless of who/what triggered it.
export async function approvePendingCheck(
  env: Env,
  pending: PendingCheckRow,
  opts: { autoPublished: boolean }
): Promise<{ toolId: number; verdict: string }> {
  const facts = JSON.parse(pending.extracted_facts as string) as ExtractedFacts;
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
        source_urls = ?, verified = 1, summary = ?, shared_domain = ?, auto_published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
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
        Number(opts.autoPublished),
        existing.id
      )
      .run();
    toolId = existing.id;
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO tools (name, domain, compliance_status, data_retention, trains_on_user_data, gdpr_mentioned, source_urls, verified, summary, shared_domain, auto_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?) RETURNING id`
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
        Number(sharedDomain),
        Number(opts.autoPublished)
      )
      .first<{ id: number }>();
    if (!inserted) throw new Error("insert_failed");
    toolId = inserted.id;
  }

  // Explicit log entry in addition to whatever the DB trigger already wrote —
  // last build's changelog history got lost when a trigger silently didn't
  // fire, so approval doesn't rely on the trigger alone.
  const note = opts.autoPublished
    ? `auto-published from pending_check #${pending.id}`
    : `approved from pending_check #${pending.id}`;
  await env.DB.prepare(
    "INSERT INTO compliance_changelog (tool_id, old_status, new_status, note) VALUES (?, ?, ?, ?)"
  )
    .bind(toolId, existing?.compliance_status ?? null, verdict, note)
    .run();

  await env.DB.prepare(
    "UPDATE pending_checks SET status = 'approved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  )
    .bind(pending.id)
    .run();

  return { toolId, verdict };
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

  const { toolId, verdict } = await approvePendingCheck(env, pending, { autoPublished: false });

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
