-- Step (c) verification, read-only. Run against policypeek-outreach(-dev) AFTER
-- applying migrations/0001_outreach.sql (and, if approved, the reviewed contacts.sql).
-- Every check row must say 'ok'. A failure makes json() error, so the
-- `wrangler d1 execute` command exits non-zero.
SELECT CASE WHEN (SELECT value FROM outreach_settings WHERE key = 'paused') = '1' THEN 'ok: paused=1' ELSE json('VERIFY FAILED: paused is not 1') END AS check_paused;
SELECT CASE WHEN (SELECT value FROM outreach_settings WHERE key = 'held_hand_list_received') = '0' THEN 'ok: held_hand_list_received=0' ELSE json('VERIFY FAILED: held_hand_list_received is not 0') END AS check_hand_list;
SELECT CASE WHEN CAST((SELECT value FROM outreach_settings WHERE key = 'daily_cap') AS INTEGER) BETWEEN 1 AND 5 THEN 'ok: daily_cap<=5' ELSE json('VERIFY FAILED: daily_cap not in 1..5') END AS check_cap;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_contacts WHERE status NOT IN ('paused', 'sent_by_hand')) = 0 THEN 'ok: no eligible contacts' ELSE json('VERIFY FAILED: a contact is not paused/sent_by_hand') END AS check_contacts_paused;
SELECT CASE WHEN (SELECT COUNT(*) FROM card_gate WHERE card_confirmed = 1) = 0 THEN 'ok: no card_confirmed' ELSE json('VERIFY FAILED: card_confirmed=1 present') END AS check_card_confirmed;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_sends) = 0 AND (SELECT COUNT(*) FROM outreach_test_sends) = 0 THEN 'ok: no sends' ELSE json('VERIFY FAILED: send rows exist') END AS check_no_sends;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_contacts WHERE tool_slug = 'mailchimp.com' AND status = 'eligible') = 0 THEN 'ok: mailchimp not eligible' ELSE json('VERIFY FAILED: mailchimp eligible') END AS check_mailchimp;
SELECT CASE WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('outreach_contacts','outreach_sends','outreach_test_sends','outreach_replies','card_gate','suppressions','outreach_settings','purge_log')) = 8 THEN 'ok: 8 tables' ELSE json('VERIFY FAILED: tables missing') END AS check_tables;
SELECT key, value FROM outreach_settings ORDER BY key;
SELECT status, COUNT(*) AS n FROM outreach_contacts GROUP BY status;
