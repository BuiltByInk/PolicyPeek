-- Verify 18 Nov 2026 VEED insert. Read-only. Expect 68 tools and exactly 1 veed.io row.
-- If PR #60 (Freshdesk, also 67->68) is applied first, the expected count becomes 69: update this file at rebase time.
SELECT 'count' AS k, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=68 THEN 'ok: count 68' ELSE json('VERIFY FAILED: tools count') END AS verify_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='veed.io' AND compliance_status='not_compliant' AND trains_on_user_data=1 AND opt_out_available=0 AND manual_override=1 AND last_checked_at='2026-11-18T09:45:00.000Z')=1 THEN 'ok: veed.io' ELSE json('VERIFY FAILED: veed.io') END AS verify_row;
SELECT 'counts_by_status' AS k, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
