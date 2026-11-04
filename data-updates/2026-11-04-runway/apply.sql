-- PolicyPeek 2026-11-04 Runway re-check: runway.com unrated -> not_compliant. PREPARED ONLY, NOT RUN.
-- Needs Elliot's own approval before Jump runs it. Run LAST: 2026-10-24-copilot-otter (if never run) -> 2026-10-28-recheck
-- -> 2026-10-28-audit -> this package. Values are byte-identical to frontend/data/tools.json on feat/qa-pages (f92634e).
-- Source: https://runway.com/terms-of-use ("Last updated October 23, 2026"); deliverables/research/recheck-10-2026-11-04.md.
-- The changelog row is written by trg_tools_changelog_on_update (no manual insert). Atomic: a failed GUARD/ASSERT rolls back.
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain = 'runway.com';
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='runway.com' AND compliance_status='unrated')=1 THEN 'ok: runway.com is unrated' ELSE json('GUARD FAILED: runway.com not unrated') END AS guard_runway;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant_with_caveats')=21 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant')=15
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_compliant')=13 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='unrated')=7
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='shared_domain_unverified')=4 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_ai_tool')=1 AND (SELECT COUNT(*) FROM tools)=61
  THEN 'ok: totals before 21/15/13/7/4/1 (61)' ELSE json('GUARD FAILED: totals before wrong (run 2026-10-28-recheck and 2026-10-28-audit first)') END AS guard_totals;
UPDATE tools SET compliance_status='not_compliant', trains_on_user_data=1, opt_out_available=0, summary='Terms of use: "You acknowledge that Inputs and Outputs may be used by the Company to train and improve its AI models, algorithms and related technology, products and services (including for labeling, classification, content moderation and model training purposes)." The only opt-out in the terms is from arbitration; no training opt-out found.',
  source_urls='["https://runway.com/terms-of-use"]', auto_published=0, manual_override=1, last_checked_at='2026-11-04T00:00:00.000Z', last_check_note=NULL,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE domain='runway.com' AND compliance_status='unrated';
SELECT 'after' AS v, domain, compliance_status, trains_on_user_data, manual_override, source_urls, summary FROM tools WHERE domain='runway.com';
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='runway.com' AND compliance_status='not_compliant' AND summary='Terms of use: "You acknowledge that Inputs and Outputs may be used by the Company to train and improve its AI models, algorithms and related technology, products and services (including for labeling, classification, content moderation and model training purposes)." The only opt-out in the terms is from arbitration; no training opt-out found.' AND source_urls='["https://runway.com/terms-of-use"]' AND last_checked_at='2026-11-04T00:00:00.000Z' AND manual_override=1)=1
  AND (SELECT COUNT(*) FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain='runway.com' AND c.old_status='unrated' AND c.new_status='not_compliant')>=1
  THEN 'ok: runway.com updated + changelog' ELSE json('ASSERT FAILED: runway.com') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant_with_caveats')=21 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant')=15
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_compliant')=14 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='unrated')=6
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='shared_domain_unverified')=4 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_ai_tool')=1 AND (SELECT COUNT(*) FROM tools)=61
  THEN 'ok: totals 21/15/14/6/4/1 (61)' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
