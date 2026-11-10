-- Verify 10 Nov 2026 Mailchimp unrated fix. Read-only. Expect 66 tools and exactly 1 updated row.
SELECT 'count' AS k, COUNT(*) AS n FROM tools;
SELECT 'row' AS k, domain, compliance_status, trains_on_user_data, opt_out_available, manual_override, last_checked_at, source_urls, summary FROM tools WHERE domain='mailchimp.com';
SELECT 'scope' AS k, COUNT(*) AS n FROM tools WHERE last_checked_at='2026-11-10T11:45:00.000Z';
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: count 66' ELSE json('VERIFY FAILED: tools count') END AS verify_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE last_checked_at='2026-11-10T11:45:00.000Z')=1 THEN 'ok: exactly 1 row in this batch' ELSE json('VERIFY FAILED: batch scope') END AS verify_scope;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='unrated' AND trains_on_user_data IS NULL AND opt_out_available IS NULL AND manual_override=1 AND last_checked_at='2026-11-10T11:45:00.000Z' AND summary NOT LIKE '%no opt-out%' AND summary NOT LIKE '%No opt-out%')=1 THEN 'ok: mailchimp.com' ELSE json('VERIFY FAILED: mailchimp.com') END AS verify_row;
SELECT 'counts_by_status' AS k, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
