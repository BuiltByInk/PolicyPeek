import type { Env } from "./index";
import type { ExtractedFacts } from "./extraction";
import { computeVerdict } from "./rules";
import { evaluateAutoPublish } from "./autoPublish";
import { cleanText } from "./textUtil";
import { THIN_CONTENT_CHARS } from "./htmlClean";

interface PendingCheckRow {
  id: number;
  domain: string;
  name?: string | null;
  is_recheck: number;
  status: string;
  source_url: string | null;
  extracted_facts: string | null;
  shared_domain: number;
  sourced_from_archive: number;
  archived_source_url?: string | null;
}

interface ToolRow {
  id: number;
  compliance_status: string;
}

export async function handleListPending(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, domain, name, is_recheck, status, source_url, extracted_facts, extraction_error, shared_domain,
       sourced_from_archive, archived_source_url, created_at, updated_at, length(raw_fetch) AS raw_fetch_chars
     FROM pending_checks ORDER BY created_at DESC`
  ).all<PendingCheckRow & { extraction_error: string | null; raw_fetch_chars: number | null }>();

  // Annotate every still-queued, already-extracted row with *why* it wasn't
  // auto-published, so admin approval is confirming a specific flagged
  // reason instead of re-deriving it from raw facts each time.
  // thin_content is derived from the stored page text, so it shows on every
  // row (even one whose extraction failed or that is queued for another
  // reason), not only when it is the reason for the hold. (2026-10-09.)
  const annotated = await Promise.all(
    results.map(async (rawRow) => {
      const { raw_fetch_chars, ...rest } = rawRow;
      const row = { ...rest, thin_content: raw_fetch_chars !== null && raw_fetch_chars < THIN_CONTENT_CHARS };
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
        sourcedFromArchive: row.sourced_from_archive === 1,
      });
      // A queued_for_review note (redirect left the domain, source host changed)
      // is the real reason this row is waiting; evaluateAutoPublish can't see it.
      const flagged = row.extraction_error?.startsWith("queued_for_review") ? row.extraction_error : null;
      return { ...row, queue_reason: flagged ?? result.reason };
    })
  );

  return Response.json({ pending_checks: annotated });
}

// Everything both publish paths (human approve and auto-publish) derive from
// a pending check before writing to `tools`, in one place so the two can't
// drift. `factColumns` is in the tools table's column order:
// data_retention, trains_on_user_data, gdpr_mentioned, opt_out_available.
function buildPublishFields(pending: PendingCheckRow) {
  const facts = JSON.parse(pending.extracted_facts as string) as ExtractedFacts;
  const sharedDomain = pending.shared_domain === 1;
  const sourcedFromArchive = pending.sourced_from_archive === 1;
  const verdict = computeVerdict(facts, { sharedDomain });
  const archiveNote = sourcedFromArchive
    ? " (sourced from an archived snapshot, not the live page — the live page blocks automated checks)"
    : "";
  const summary = sharedDomain
    ? "Policy text is shared across multiple company products — not verified as specific to this tool."
    : (facts.relevant_clauses[0] ?? null) && `${facts.relevant_clauses[0]}${archiveNote}`;
  const sourceUrls = JSON.stringify(
    [pending.source_url, sourcedFromArchive ? pending.archived_source_url : null].filter((u): u is string => Boolean(u))
  );
  const nullableBool = (v: boolean | null) => (v === null ? null : Number(v));
  const factColumns = [
    facts.data_retention,
    nullableBool(facts.trains_on_user_data),
    nullableBool(facts.gdpr_mentioned),
    nullableBool(facts.opt_out_available),
  ] as const;

  return { verdict, factColumns, summary, sourceUrls, sharedDomain, sourcedFromArchive };
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
  const { verdict, factColumns, summary, sourceUrls, sharedDomain, sourcedFromArchive } = buildPublishFields(pending);

  const existing = await env.DB.prepare("SELECT id, compliance_status FROM tools WHERE domain = ?")
    .bind(pending.domain)
    .first<ToolRow>();

  let toolId: number;
  if (existing) {
    // Resubmission path: a domain that already has a rating gets updated in
    // place instead of dead-ending on a duplicate-domain conflict.
    await env.DB.prepare(
      `UPDATE tools SET compliance_status = ?, data_retention = ?, trains_on_user_data = ?, gdpr_mentioned = ?,
        opt_out_available = ?, source_urls = ?, verified = 1, summary = ?, shared_domain = ?, auto_published = ?, sourced_from_archive = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_check_note = NULL
       WHERE id = ?`
    )
      .bind(
        verdict,
        ...factColumns,
        sourceUrls,
        summary,
        Number(sharedDomain),
        Number(opts.autoPublished),
        Number(sourcedFromArchive),
        existing.id
      )
      .run();
    toolId = existing.id;
  } else {
    const inserted = await env.DB.prepare(
      `INSERT INTO tools (name, domain, compliance_status, data_retention, trains_on_user_data, gdpr_mentioned, opt_out_available, source_urls, verified, summary, shared_domain, auto_published, sourced_from_archive, last_checked_at, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')) RETURNING id`
    )
      .bind(
        pending.name || pending.domain,
        pending.domain,
        verdict,
        ...factColumns,
        sourceUrls,
        summary,
        Number(sharedDomain),
        Number(opts.autoPublished),
        Number(sourcedFromArchive)
      )
      .first<{ id: number }>();
    if (!inserted) throw new Error("insert_failed");
    toolId = inserted.id;
  }

  // Explicit log entry in addition to whatever the DB trigger already wrote —
  // last build's changelog history got lost when a trigger silently didn't
  // fire, so approval doesn't rely on the trigger alone. Only log when the
  // status actually moved (2026-09-06, Low finding from the concurrency
  // harness): a resubmission/recheck that resolves to the same verdict as
  // before is a legitimate no-op write, not an audit-worthy transition, and
  // logging it anyway on every one of N duplicate submissions is what made
  // the audit trail noisy.
  const statusChanged = existing === null || existing.compliance_status !== verdict;
  if (statusChanged) {
    const note = opts.autoPublished
      ? `auto-published from pending_check #${pending.id}`
      : `approved from pending_check #${pending.id}`;
    await env.DB.prepare(
      "INSERT INTO compliance_changelog (tool_id, old_status, new_status, note) VALUES (?, ?, ?, ?)"
    )
      .bind(toolId, existing?.compliance_status ?? null, verdict, note)
      .run();
  }

  await env.DB.prepare(
    "UPDATE pending_checks SET status = 'approved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  )
    .bind(pending.id)
    .run();

  return { toolId, verdict };
}

// Race-safe alternative to approvePendingCheck, used ONLY by the automatic
// publish path (check.ts's runExtraction). A human clicking "approve" one
// at a time (handleApprove, above) is never racing itself, so that path
// keeps approvePendingCheck's simpler read-then-write shape unchanged.
//
// The bug this closes (2026-09-06, see DECISIONS_NEEDED.md): two
// concurrently-processed first-time checks of the same brand-new domain
// could each independently decide "nothing published yet, safe to
// auto-publish" and both write -- the loser's *different* verdict would
// silently overwrite the winner's with no human review, exactly the
// outcome evaluateAutoPublish's verdict-flip guard exists to prevent. The
// guard failed there because the caller's "does a verdict already exist"
// read happens once, well before this write -- fine most of the time, but
// stale by the time a slower concurrent sibling finally gets here.
//
// Fix: `freshRead` must be taken by the caller *immediately* before calling
// this, and the actual write is made conditional on that exact snapshot
// still holding -- an INSERT that backs off if the UNIQUE(domain)
// constraint would fire (someone else won), or an UPDATE guarded by `WHERE
// id = ? AND compliance_status = ?` (someone else changed it since we
// looked). Either way, `published: false` means we lost the race in the
// gap between the snapshot and this call -- the caller routes that to the
// human-review queue instead of assuming success or retrying blindly.
export async function tryAutoPublishAtomic(
  env: Env,
  pending: PendingCheckRow,
  freshRead: ToolRow | null
): Promise<{ toolId: number; verdict: string; published: boolean }> {
  const { verdict, factColumns, summary, sourceUrls, sharedDomain, sourcedFromArchive } = buildPublishFields(pending);

  let toolId: number;
  let published: boolean;

  if (freshRead === null) {
    // Believed brand-new. ON CONFLICT DO NOTHING means a concurrent winner's
    // row (if one appeared in the gap since freshRead was taken) is left
    // completely untouched -- we just detect that we lost, via RETURNING
    // giving back no row.
    const inserted = await env.DB.prepare(
      `INSERT INTO tools (name, domain, compliance_status, data_retention, trains_on_user_data, gdpr_mentioned, opt_out_available, source_urls, verified, summary, shared_domain, auto_published, sourced_from_archive, last_checked_at, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT (domain) DO NOTHING
       RETURNING id`
    )
      .bind(
        pending.name || pending.domain,
        pending.domain,
        verdict,
        ...factColumns,
        sourceUrls,
        summary,
        Number(sharedDomain),
        Number(sourcedFromArchive)
      )
      .first<{ id: number }>();
    published = inserted !== null;
    toolId = inserted?.id ?? -1;
  } else {
    // Believed already published with a specific status. The UPDATE is
    // guarded on that exact status still holding (`WHERE id = ? AND
    // compliance_status = ?`) -- a classic compare-and-swap. If another
    // writer changed it in the gap between our read and this call,
    // meta.changes is 0 and we detect we lost, rather than assuming our
    // write landed.
    const result = await env.DB.prepare(
      `UPDATE tools SET compliance_status = ?, data_retention = ?, trains_on_user_data = ?, gdpr_mentioned = ?,
        opt_out_available = ?, source_urls = ?, verified = 1, summary = ?, shared_domain = ?, auto_published = 1, sourced_from_archive = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_check_note = NULL
       WHERE id = ? AND compliance_status = ?`
    )
      .bind(
        verdict,
        ...factColumns,
        sourceUrls,
        summary,
        Number(sharedDomain),
        Number(sourcedFromArchive),
        freshRead.id,
        freshRead.compliance_status
      )
      .run();
    published = result.meta.changes > 0;
    toolId = freshRead.id;
  }

  if (!published) {
    return { toolId, verdict, published: false };
  }

  // Same no-op guard as approvePendingCheck's explicit log entry above (2026-09-06
  // Low finding): the compare-and-swap WHERE clause above matches for every
  // concurrent racer as long as the verdict doesn't change value, so without this
  // guard N concurrent duplicate rechecks of an unchanged verdict each log an
  // identical old_status===new_status row.
  const statusChanged = freshRead === null || freshRead.compliance_status !== verdict;
  if (statusChanged) {
    await env.DB.prepare(
      "INSERT INTO compliance_changelog (tool_id, old_status, new_status, note) VALUES (?, ?, ?, ?)"
    )
      .bind(toolId, freshRead?.compliance_status ?? null, verdict, `auto-published from pending_check #${pending.id}`)
      .run();
  }

  await env.DB.prepare(
    "UPDATE pending_checks SET status = 'approved', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  )
    .bind(pending.id)
    .run();

  return { toolId, verdict, published: true };
}

// Deliberately no status check (2026-10-09, Elliot's ruling, item 3 of the
// submit-flow questions in DECISIONS_NEEDED.md): approving an already-approved
// row re-publishes it from that row's facts (the deploy runbook's hancocyber.com
// re-approve relies on this to apply a rule change), and approving a rejected
// row publishes it (a change of mind). Both are intentional; don't add a guard.
export async function handleApprove(env: Env, id: number): Promise<Response> {
  const pending = await env.DB.prepare(
    `SELECT id, domain, name, is_recheck, status, source_url, extracted_facts, shared_domain, sourced_from_archive, archived_source_url
     FROM pending_checks WHERE id = ?`
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

export async function handleReject(env: Env, id: number): Promise<Response> {
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

// Demotes a published tool to `unrated` with a written reason and an audit
// trail (Elliot, 2026-09-19). Until this existed the only way to take back a
// badge that turned out to be unsupported was a hand-written remote database
// command. The stored training facts are cleared because "unrated" means we
// don't know, and a leftover "trains: No" beside it is exactly the
// contradiction a reader would notice; the old values go into the changelog
// note so it can be undone. A later recheck that computes a different verdict
// queues for review (the flip rule), so nothing re-promotes it automatically.
export async function handleDemote(request: Request, env: Env, id: number): Promise<Response> {
  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown } | null;
    reason = cleanText(body?.reason, 300);
  } catch {
    // fall through: a missing or malformed body is the same as no reason
  }
  if (!reason) {
    return Response.json({ error: "reason_required" }, { status: 400 });
  }

  const tool = await env.DB.prepare(
    "SELECT id, domain, compliance_status, trains_on_user_data, opt_out_available, summary FROM tools WHERE id = ?"
  )
    .bind(id)
    .first<{
      id: number;
      domain: string;
      compliance_status: string;
      trains_on_user_data: number | null;
      opt_out_available: number | null;
      summary: string | null;
    }>();
  if (!tool) {
    return Response.json({ error: "tool_not_found" }, { status: 404 });
  }
  if (tool.compliance_status === "unrated") {
    return Response.json({ error: "already_unrated" }, { status: 409 });
  }

  // Compare-and-swap on the status we just read, like the auto-publish path:
  // if someone changed it in the meantime, don't overwrite blindly.
  const result = await env.DB.prepare(
    `UPDATE tools SET compliance_status = 'unrated', trains_on_user_data = NULL, opt_out_available = NULL, summary = NULL,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND compliance_status = ?`
  )
    .bind(tool.id, tool.compliance_status)
    .run();
  if (result.meta.changes === 0) {
    return Response.json({ error: "status_changed_meanwhile" }, { status: 409 });
  }

  const oldSummary = cleanText(tool.summary, 120);
  const was = `was ${tool.compliance_status}, trains=${tool.trains_on_user_data ?? "null"}, opt_out=${tool.opt_out_available ?? "null"}${oldSummary ? `, summary="${oldSummary}"` : ""}`;
  await env.DB.prepare("INSERT INTO compliance_changelog (tool_id, old_status, new_status, note) VALUES (?, ?, 'unrated', ?)")
    .bind(tool.id, tool.compliance_status, `demoted by admin: ${reason} (${was})`)
    .run();

  return Response.json({ tool_id: tool.id, domain: tool.domain, old_status: tool.compliance_status, new_status: "unrated" });
}
