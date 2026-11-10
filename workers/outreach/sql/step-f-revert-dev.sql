-- Step (f) revert: run IMMEDIATELY after the one [TEST] send. DEV only.
UPDATE outreach_settings SET value = '1' WHERE key = 'paused';
DELETE FROM outreach_test_sends WHERE contact_id IN (SELECT id FROM outreach_contacts WHERE contact_email = 'privacy@example.com');
DELETE FROM outreach_contacts WHERE contact_email = 'privacy@example.com' AND tool_slug = 'example.com';
DELETE FROM card_gate WHERE tool_slug = 'example.com';
-- TEST reply rows, if any reached the dev DB (Elliot's own mailbox domain only).
DELETE FROM outreach_replies WHERE from_domain = 'pm.me';
DELETE FROM suppressions WHERE value IN ('elliotink@pm.me', 'pm.me');
SELECT CASE WHEN (SELECT value FROM outreach_settings WHERE key = 'paused') = '1' AND (SELECT COUNT(*) FROM outreach_contacts) = 0 AND (SELECT COUNT(*) FROM card_gate) = 0 AND (SELECT COUNT(*) FROM outreach_replies WHERE from_domain = 'pm.me') = 0 THEN 'ok: dev reverted' ELSE json('REVERT FAILED') END AS check_revert;
