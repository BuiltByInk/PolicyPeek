-- Rollback generated 2026-10-24T09:49:58.235Z from the live before-snapshot (0 rows). Run as one --file batch.
-- ahrefs.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'ahrefs.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'ahrefs.com' AND manual_override = 1;
-- base44.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'base44.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'base44.com' AND manual_override = 1;
-- buffer.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'buffer.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'buffer.com' AND manual_override = 1;
-- deepseek.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'deepseek.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'deepseek.com' AND manual_override = 1;
-- invideo.io was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'invideo.io' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'invideo.io' AND manual_override = 1;
-- kling.ai was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'kling.ai' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'kling.ai' AND manual_override = 1;
-- mailchimp.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'mailchimp.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'mailchimp.com' AND manual_override = 1;
-- meshy.ai was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'meshy.ai' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'meshy.ai' AND manual_override = 1;
-- moises.ai was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'moises.ai' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'moises.ai' AND manual_override = 1;
-- pictory.ai was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'pictory.ai' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'pictory.ai' AND manual_override = 1;
-- pika.art was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'pika.art' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'pika.art' AND manual_override = 1;
-- poe.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'poe.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'poe.com' AND manual_override = 1;
-- remove.bg was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'remove.bg' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'remove.bg' AND manual_override = 1;
-- suno.com was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'suno.com' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'suno.com' AND manual_override = 1;
-- tldv.io was inserted by apply.sql: drop its trigger-written changelog row(s) (FK), then the row.
DELETE FROM compliance_changelog WHERE tool_id IN (SELECT id FROM tools WHERE domain = 'tldv.io' AND manual_override = 1);
DELETE FROM tools WHERE domain = 'tldv.io' AND manual_override = 1;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE manual_override = 1 AND id IN (NULL)) = 0 THEN 'ok: rolled back' ELSE json('ROLLBACK ASSERT FAILED') END AS assert_rollback;
