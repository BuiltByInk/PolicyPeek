-- Verify 18 Nov 2026 Venice AI insert. Read-only. Expect 67 tools and exactly 1 venice.ai row.
SELECT 'count' AS k, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=67 THEN 'ok: count 67' ELSE json('VERIFY FAILED: tools count') END AS verify_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='venice.ai' AND compliance_status='compliant' AND trains_on_user_data=0 AND manual_override=1 AND last_checked_at='2026-11-18T09:12:00.000Z')=1 THEN 'ok: venice.ai' ELSE json('VERIFY FAILED: venice.ai') END AS verify_row;
SELECT 'counts_by_status' AS k, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
