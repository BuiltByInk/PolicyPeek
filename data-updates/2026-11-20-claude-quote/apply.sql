-- PREPARED ONLY: local review artifact. NOT RUN against D1.
-- 20 Nov 2026: Claude (claude.com) quote fix. Steward fact-check 18 Nov 2026.
-- Replaces our own words that were shown as policy text. Verdict and badge unchanged.
-- Guard binds to the 15 Oct 2026 row. Updates only claude.com.
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain='claude.com';
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='claude.com' AND compliance_status='compliant_with_caveats' AND summary='Consumer plans (Free, Pro, Max): We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings. Commercial plans don''t train by default.' AND data_retention='Feedback data stored for up to 5 years in secured back-end')=1 THEN 'ok: claude.com' ELSE json('GUARD FAILED: claude.com has changed; review again') END AS guard_target;
UPDATE tools SET
  summary='We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings. This Privacy Policy does not apply to content that we process on behalf of customers of our business offerings, such as our Enterprise accounts.',
  data_retention='You also are able to delete individual conversations, which will be removed immediately from your conversation history and automatically deleted from our back-end within 30 days.',
  source_urls='["https://www.anthropic.com/legal/privacy", "https://www.anthropic.com/legal/commercial-terms"]',
  last_checked_at='2026-11-18T11:20:00.000Z',
  last_check_note=NULL,
  manual_override=1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='claude.com' AND compliance_status='compliant_with_caveats'
  AND summary='Consumer plans (Free, Pro, Max): We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings. Commercial plans don''t train by default.';
SELECT 'after' AS snapshot, domain, compliance_status, trains_on_user_data, manual_override, last_checked_at, source_urls, summary, data_retention FROM tools WHERE domain='claude.com';
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE last_checked_at='2026-11-18T11:20:00.000Z')=1 THEN 'ok: only claude.com has this last_checked_at' ELSE json('ASSERT FAILED: unexpected last_checked_at set') END AS assert_scope;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='claude.com' AND compliance_status='compliant_with_caveats' AND trains_on_user_data=1 AND manual_override=1 AND last_checked_at='2026-11-18T11:20:00.000Z' AND summary='We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings. This Privacy Policy does not apply to content that we process on behalf of customers of our business offerings, such as our Enterprise accounts.' AND data_retention='You also are able to delete individual conversations, which will be removed immediately from your conversation history and automatically deleted from our back-end within 30 days.')=1 THEN 'ok: claude.com' ELSE json('ASSERT FAILED: claude.com') END AS assert_row;
