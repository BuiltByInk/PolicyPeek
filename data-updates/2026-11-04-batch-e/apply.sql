-- PolicyPeek 2026-11-04 Batch E (Figma AI + Abacus.AI only). PREPARED ONLY, NOT RUN. Needs Elliot's OK to apply.
-- Source: /workspace/deliverables/research/batch-E-2026-11-04.md. Pinned with manual_override = 1.
SELECT 'before_snapshot' AS snapshot, id, domain, compliance_status FROM tools WHERE domain IN ('figma.com','abacus.ai');
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN ('figma.com','abacus.ai')) = 0 THEN 'ok: neither domain exists yet' ELSE json('GUARD FAILED: a target domain is already in tools') END AS guard_absent;
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Figma AI', 'figma.com', 'compliant_with_caveats', 1, 1, '["https://help.figma.com/hc/en-us/articles/17725942479127-Manage-AI-settings-and-content-training-for-your-team-or-organization", "https://www.figma.com/legal/privacy/"]', 1, 0, 0, 0, 'Rated on the free Starter plan: "By default, content training is turned on for Starter teams. Admins of a Starter team can toggle off content training at any time in the team''s settings." Paid plans: "By default, content training is turned off on Organization and Enterprise plans."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'figma.com');
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Abacus.AI', 'abacus.ai', 'compliant', 0, 0, '["https://abacus.ai/privacy-policy"]', 1, 0, 0, 0, '"We do not use any personal information, Google user data, or customer-provided content (including prompts, uploads, or API data) to develop, improve, or train any generalized or proprietary AI or ML models."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'abacus.ai');
SELECT 'after' AS snapshot, id, name, domain, compliance_status, trains_on_user_data, opt_out_available FROM tools WHERE domain IN ('figma.com','abacus.ai');
