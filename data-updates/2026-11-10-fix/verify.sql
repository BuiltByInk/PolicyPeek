-- Verify 10 Nov 2026 catalog fix. Read-only. Expect 66 tools and exactly these 3 updated rows.
SELECT 'count' AS k, COUNT(*) AS n FROM tools;
SELECT 'rows' AS k, domain, compliance_status, manual_override, opt_out_available, trains_on_user_data, last_checked_at, source_urls, summary FROM tools WHERE domain IN ('mailchimp.com','meshy.ai','kling.ai') ORDER BY domain;
SELECT 'scope' AS k, COUNT(*) AS n FROM tools WHERE last_checked_at='2026-11-10T11:39:00.000Z';
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: count 66' ELSE json('VERIFY FAILED: tools count') END AS verify_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE last_checked_at='2026-11-10T11:39:00.000Z')=3 THEN 'ok: exactly 3 rows in this batch' ELSE json('VERIFY FAILED: batch scope') END AS verify_scope;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='not_compliant' AND manual_override=1 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary NOT LIKE '%no opt-out found%')=1 THEN 'ok: mailchimp.com' ELSE json('VERIFY FAILED: mailchimp.com') END AS verify_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='meshy.ai' AND compliance_status='compliant_with_caveats' AND manual_override=1 AND opt_out_available=1 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary LIKE '%support@meshy.ai%')=1 THEN 'ok: meshy.ai' ELSE json('VERIFY FAILED: meshy.ai') END AS verify_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='kling.ai' AND compliance_status='compliant_with_caveats' AND manual_override=1 AND opt_out_available=1 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary LIKE '%support@kling.ai%')=1 THEN 'ok: kling.ai' ELSE json('VERIFY FAILED: kling.ai') END AS verify_row;
SELECT 'counts_by_status' AS k, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
