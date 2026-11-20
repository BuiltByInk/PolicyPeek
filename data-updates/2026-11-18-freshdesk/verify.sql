-- Verify 18 Nov 2026 Freshdesk Freddy insert. Read-only. Expect 68 tools and exactly 1 freshdesk.com row.
SELECT 'count' AS k, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=68 THEN 'ok: count 68' ELSE json('VERIFY FAILED: tools count') END AS verify_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='freshdesk.com' AND compliance_status='compliant_with_caveats' AND trains_on_user_data=1 AND manual_override=1 AND last_checked_at='2026-11-17T09:42:00.000Z')=1 THEN 'ok: freshdesk.com' ELSE json('VERIFY FAILED: freshdesk.com') END AS verify_row;
SELECT 'counts_by_status' AS k, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
