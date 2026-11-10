-- Step (f) revert, part 2 (Jump 12:29 UK): delete the TEST reply rows. PRODUCTION
-- outreach DB (policypeek-outreach), because the prod reply Worker handles
-- privacy@. Run once, after Elliot's reply round-trip and >256 KB checks pass.
-- Scope: only rows from Elliot's own mailbox domain pm.me, never a company row.
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_replies WHERE from_domain = 'pm.me' AND matched_contact_id IS NOT NULL) = 0 THEN 'ok: no pm.me row is matched to a real contact' ELSE json('ABORT: a pm.me reply row is matched to a contact; review by hand') END AS precheck;
DELETE FROM outreach_replies WHERE from_domain = 'pm.me' AND matched_contact_id IS NULL;
DELETE FROM suppressions WHERE value IN ('elliotink@pm.me', 'pm.me');
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_replies WHERE from_domain = 'pm.me') = 0 AND (SELECT COUNT(*) FROM suppressions WHERE value IN ('elliotink@pm.me', 'pm.me')) = 0 THEN 'ok: TEST reply rows removed' ELSE json('CLEANUP FAILED') END AS check_cleanup;
