-- Step (f) [TEST] send: DEV database (policypeek-outreach-dev) ONLY.
-- Pre-condition: dev DB has the schema and NO real contacts (checked below).
-- Loads exactly ONE synthetic contact on example.com and opens dev for one run.
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_contacts) = 0 THEN 'ok: dev has no contacts' ELSE json('ABORT: dev DB has contacts; never run (f) with real contacts loaded') END AS precheck;
INSERT INTO outreach_contacts (tool_slug, tool_name, tool_domain, kind, contact_email, role, contact_source_url, policy_url, policy_label, question_text, vetted_by, vetted_at, status)
VALUES ('example.com', 'Example Tool (TEST)', 'example.com', 'ambiguous_live', 'privacy@example.com', 'privacy', 'https://example.com/privacy', 'https://example.com/privacy', 'Privacy Policy', 'We reviewed https://example.com/privacy. This is a synthetic test contact for the PolicyPeek [TEST] send; no company is being contacted.', 'dev (step f synthetic)', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'eligible');
INSERT INTO card_gate (tool_slug, flagged, passes, gate_reason, flag_source, basis, verdict_at_load, live_verdict, verdict_as_of)
VALUES ('example.com', 0, 1, 'pass: step (f) synthetic test contact', 'step-f-setup-dev.sql', 'unclear_live', 'unrated', 'unrated', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
UPDATE outreach_settings SET value = '0' WHERE key = 'paused';
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_contacts) = 1 AND (SELECT contact_email FROM outreach_contacts) = 'privacy@example.com' THEN 'ok: exactly one synthetic contact' ELSE json('ABORT') END AS postcheck;
