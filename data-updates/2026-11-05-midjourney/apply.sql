-- PolicyPeek 2026-11-05 Midjourney: midjourney.com unrated -> not_compliant.
-- Elliot OK 5 Nov 2026 09:19 Europe/London. Research FINAL PACKAGE in deliverables/research/recheck-10-2026-11-04.md.
-- Run AFTER 2026-11-04-runway (live totals must be 21/15/14/6/4/1). Changelog via trg_tools_changelog_on_update.
-- Atomic: failed GUARD/ASSERT rolls back the whole file.
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain = 'midjourney.com';
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='midjourney.com' AND compliance_status='unrated')=1 THEN 'ok: midjourney.com is unrated' ELSE json('GUARD FAILED: midjourney.com not unrated') END AS guard_midjourney;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant_with_caveats')=21 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant')=15
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_compliant')=14 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='unrated')=6
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='shared_domain_unverified')=4 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_ai_tool')=1 AND (SELECT COUNT(*) FROM tools)=61
  THEN 'ok: totals before 21/15/14/6/4/1 (61)' ELSE json('GUARD FAILED: totals before wrong (run 2026-11-04-runway first)') END AS guard_totals;
UPDATE tools SET compliance_status='not_compliant', trains_on_user_data=1, opt_out_available=0, summary='Public Summary of Training Content: "Was data from user interactions with the AI model (e.g. user input and prompts) used to train the model? ☒ Yes" (Text and Image). AB2013 Documentation: "Data from third parties and Midjourney users: Non-public data from third party providers and data our users provide through use of the Midjourney service." No training opt-out found (only robots.txt/crawler controls and CCPA sale/sharing).',
  source_urls='["https://docs.midjourney.com/hc/en-us/articles/48067080311309-Public-Summary-of-Training-Content", "https://docs.midjourney.com/hc/en-us/articles/42829949256205-AB2013-Documentation"]', auto_published=0, manual_override=1, last_checked_at='2026-11-05T00:00:00.000Z', last_check_note=NULL,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE domain='midjourney.com' AND compliance_status='unrated';
SELECT 'after' AS v, domain, compliance_status, trains_on_user_data, manual_override, source_urls, summary FROM tools WHERE domain='midjourney.com';
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='midjourney.com' AND compliance_status='not_compliant' AND summary='Public Summary of Training Content: "Was data from user interactions with the AI model (e.g. user input and prompts) used to train the model? ☒ Yes" (Text and Image). AB2013 Documentation: "Data from third parties and Midjourney users: Non-public data from third party providers and data our users provide through use of the Midjourney service." No training opt-out found (only robots.txt/crawler controls and CCPA sale/sharing).' AND source_urls='["https://docs.midjourney.com/hc/en-us/articles/48067080311309-Public-Summary-of-Training-Content", "https://docs.midjourney.com/hc/en-us/articles/42829949256205-AB2013-Documentation"]' AND last_checked_at='2026-11-05T00:00:00.000Z' AND manual_override=1 AND trains_on_user_data=1 AND opt_out_available=0)=1
  AND (SELECT COUNT(*) FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain='midjourney.com' AND c.old_status='unrated' AND c.new_status='not_compliant')>=1
  THEN 'ok: midjourney.com updated + changelog' ELSE json('ASSERT FAILED: midjourney.com') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant_with_caveats')=21 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='compliant')=15
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_compliant')=15 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='unrated')=5
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status='shared_domain_unverified')=4 AND (SELECT COUNT(*) FROM tools WHERE compliance_status='not_ai_tool')=1 AND (SELECT COUNT(*) FROM tools)=61
  THEN 'ok: totals 21/15/15/5/4/1 (61)' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
