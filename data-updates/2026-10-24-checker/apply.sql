-- PolicyPeek 2026-10-24 checker data update. PREPARED ONLY, NOT RUN. See README.md for the run order.
-- Elliot's decisions (relayed by Jump, 24 Oct): Zapier published as compliant_with_caveats (manual override);
-- Perplexity unrated -> not_compliant (accepted checker change). Both pinned with manual_override = 1 so the
-- daily recheck never auto-publishes over them.
-- Prereq: migrations/2026-10-15-add-manual-override.sql applied (else 'no such column' and nothing changes).
-- Atomicity: D1 runs a --file as one batch; any error (incl. a failed ASSERT, which calls json() on invalid
-- text) rolls back every statement.

-- 1. BEFORE SNAPSHOT (tools/gen_rollback.mjs builds the rollback from it; zapier.com is expected to be absent)
SELECT 'before_snapshot' AS snapshot, id, domain, compliance_status, trains_on_user_data, opt_out_available, summary, source_urls,
       sourced_from_archive, auto_published, manual_override, last_checked_at, last_check_note, updated_at
FROM tools WHERE domain IN ('perplexity.ai', 'zapier.com') ORDER BY domain;
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT 'queued_rechecks' AS snapshot, id, domain, status, created_at FROM pending_checks
WHERE status IN ('pending','extracted') AND domain IN ('perplexity.ai', 'zapier.com');

-- 2. GUARDS (must hold before anything changes)
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'zapier.com') = 0
  THEN 'ok: zapier.com not yet published' ELSE json('GUARD FAILED: zapier.com already in tools') END AS guard_zapier;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain = 'perplexity.ai' AND compliance_status = 'unrated') = 1
  THEN 'ok: perplexity.ai is unrated' ELSE json('GUARD FAILED: perplexity.ai not in expected state') END AS guard_perplexity;

-- 3. CHANGES
-- Zapier: new (held) -> compliant_with_caveats. Source: Research re-check 24 Oct (automation-platform-information, clause at ~10,600).
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, gdpr_mentioned, opt_out_available, source_urls, verified,
                   shared_domain, auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Zapier', 'zapier.com', 'compliant_with_caveats', 1, 1, 1,
  '["https://zapier.com/legal/automation-platform-information", "https://zapier.com/legal/terms-of-service"]', 1, 0, 0, 0,
  '"Enterprise customers are automatically opted out of Zapier using their content for model training and improvement purposes. All other customers may opt out at any time."',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'zapier.com');

-- Perplexity: unrated -> not_compliant (pinned on expected current status).
UPDATE tools SET compliance_status = 'not_compliant', trains_on_user_data = 1, opt_out_available = 0,
  summary = 'Perplexity''s privacy notice lists "Improve or create services and products, including our AI models." as a use of your data. The only opt-outs it describes are for targeted advertising, not training.',
  source_urls = '["https://www.perplexity.ai/hub/legal/privacy-notice"]', sourced_from_archive = 0,
  auto_published = 0, manual_override = 1, last_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_check_note = NULL,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain = 'perplexity.ai' AND compliance_status = 'unrated';

-- 4. VERIFICATION
SELECT 'after' AS v, domain, compliance_status, manual_override, auto_published, trains_on_user_data, opt_out_available, source_urls, summary
FROM tools WHERE domain IN ('perplexity.ai', 'zapier.com') ORDER BY domain;
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;

-- 5. ASSERTS
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE manual_override = 1 AND (
      (domain = 'zapier.com' AND compliance_status = 'compliant_with_caveats' AND opt_out_available = 1)
   OR (domain = 'perplexity.ai' AND compliance_status = 'not_compliant'))) = 2
  THEN 'ok: both rows updated' ELSE json('ASSERT FAILED: not every target row was updated') END AS assert_rows;
-- Totals expected from frontend/data/tools.json at 7c53e10 (43 tools: caveats 15, compliant 11, unrated 8,
-- shared 4, not_compliant 4, not_ai_tool 1) after this update. If live D1 differs from tools.json, this fails
-- and nothing changes: re-sync expectations first.
SELECT CASE WHEN
      (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant_with_caveats') = 16
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant') = 11
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'unrated') = 7
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_compliant') = 5
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'shared_domain_unverified') = 4
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_ai_tool') = 1
  THEN 'ok: totals 16/11/7/5/4/1 (44)' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
