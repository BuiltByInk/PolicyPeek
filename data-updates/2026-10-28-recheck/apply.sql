-- PolicyPeek 2026-10-28 re-check data update (Perplexity, Mailchimp, Notion). PREPARED ONLY, NOT RUN.
-- Needs Elliot's own approval before Jump runs it. See README.md for the run order.
-- Source: deliverables/research/recheck-perplexity-mailchimp-notion-2026-10-28.md, each quote re-verified by
-- PolicyPeek Dev on 28 Oct 2026 (snapshots in research/qa-sources/2026-10-28/).
-- Atomicity: D1 runs a --file as one batch; any error (incl. a failed GUARD/ASSERT, which calls json() on
-- invalid text) rolls back every statement.

-- 1. BEFORE SNAPSHOT (tools/gen_rollback.mjs rebuilds every row and Mailchimp's changelog rows from these)
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain IN ('mailchimp.com', 'notion.com', 'perplexity.ai') ORDER BY domain;
SELECT 'before_changelog' AS snapshot, c.* FROM compliance_changelog c JOIN tools t ON t.id = c.tool_id WHERE t.domain = 'mailchimp.com' ORDER BY c.id;
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT 'queued_rechecks' AS snapshot, id, domain, status, created_at FROM pending_checks
WHERE status IN ('pending','extracted') AND domain IN ('mailchimp.com', 'notion.com', 'perplexity.ai');

-- 2. GUARDS (must hold before anything changes)
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'perplexity.ai' AND compliance_status = 'not_compliant') = 1
  THEN 'ok: perplexity.ai is not_compliant' ELSE json('GUARD FAILED: perplexity.ai not in expected state') END AS guard_perplexity;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'mailchimp.com' AND compliance_status = 'not_compliant') = 1
  THEN 'ok: mailchimp.com is not_compliant' ELSE json('GUARD FAILED: mailchimp.com not in expected state') END AS guard_mailchimp;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'notion.com' AND compliance_status = 'compliant') = 1
  THEN 'ok: notion.com is compliant' ELSE json('GUARD FAILED: notion.com not in expected state') END AS guard_notion;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools) = 59
  THEN 'ok: 59 tools before' ELSE json('GUARD FAILED: expected 59 tools before (origin/main tools.json)') END AS guard_total;

-- 3. CHANGES
-- Perplexity: not_compliant -> compliant_with_caveats. The "AI data retention" toggle (on by default for
-- Free/Pro/Max, applies only to data collected after opting out) is a training opt-out. Manual entry:
-- perplexity.ai returns 403 to the pipeline. Pinned so the daily recheck never auto-publishes over it.
UPDATE tools SET compliance_status = 'compliant_with_caveats', trains_on_user_data = 1, opt_out_available = 1,
  summary = 'For Free, Perplexity Pro and Perplexity Max users, AI Data Retention is enabled by default. However, these users can control whether their data is used for AI model training.',
  source_urls = '["https://www.perplexity.ai/help-center/en/articles/11564572-data-collection-at-perplexity"]', sourced_from_archive = 0,
  auto_published = 0, manual_override = 1, last_checked_at = '2026-10-28T12:00:00.000Z', last_check_note = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain = 'perplexity.ai' AND compliance_status = 'not_compliant';

-- Mailchimp: HELD (unpublished). The terms point to "preferences about your data"; the only documented
-- setting ("Data analytics") never mentions AI training, so the opt-out is inferred -> hold rule.
-- Its changelog rows are FK-bound to the tools row, so they go first; the rollback re-inserts both.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'mailchimp.com' AND compliance_status = 'not_compliant');
DELETE FROM tools WHERE domain = 'mailchimp.com' AND compliance_status = 'not_compliant';

-- Notion: stays compliant; quote replaced with the live wording (the old quote is no longer on the page).
UPDATE tools SET summary = 'By default, neither Notion nor our AI providers use your Customer Data to train any models.',
  source_urls = '["https://www.notion.com/help/notion-ai-security-practices"]', manual_override = 1,
  last_checked_at = '2026-10-28T12:00:00.000Z', last_check_note = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain = 'notion.com' AND compliance_status = 'compliant';

-- 4. VERIFICATION
SELECT 'after' AS v, domain, compliance_status, manual_override, auto_published, trains_on_user_data, opt_out_available, source_urls, summary
FROM tools WHERE domain IN ('mailchimp.com', 'notion.com', 'perplexity.ai') ORDER BY domain;
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;

-- 5. ASSERTS
SELECT CASE WHEN
      (SELECT COUNT(*) FROM tools WHERE domain = 'perplexity.ai' AND compliance_status = 'compliant_with_caveats' AND opt_out_available = 1 AND manual_override = 1) = 1
  AND (SELECT COUNT(*) FROM tools WHERE domain = 'mailchimp.com') = 0
  AND (SELECT COUNT(*) FROM tools WHERE domain = 'notion.com' AND compliance_status = 'compliant' AND summary LIKE 'By default, neither Notion nor our AI providers%') = 1
  THEN 'ok: all three rows changed' ELSE json('ASSERT FAILED: not every target row was changed') END AS assert_rows;
-- Totals: origin/main tools.json (59: caveats 19, compliant 14, not_compliant 14, unrated 7, shared 4,
-- not_ai_tool 1) after this update.
SELECT CASE WHEN
      (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant_with_caveats') = 20
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant') = 14
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_compliant') = 12
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'unrated') = 7
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'shared_domain_unverified') = 4
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_ai_tool') = 1
  AND (SELECT COUNT(*) FROM tools) = 58
  THEN 'ok: totals 20/14/12/7/4/1 (58)' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
