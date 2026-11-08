-- PREPARED ONLY: local review artifact. NOT RUN. No approval to apply to D1 or deploy.
-- Steward: factcheck-2026-11-08.md; snapshots fetched 8 Nov 2026 (Europe/London).
-- Future application requires fresh approval, before-row backups and atomic batch execution.
-- Guards bind to observed live target rows, not a stale global catalog count.
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain IN ('slack.com','fireflies.ai','zoom.com');
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='slack.com')=0 THEN 'ok: slack.com' ELSE json('GUARD FAILED: slack.com has changed; review again') END AS guard_target;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='fireflies.ai' AND compliance_status='compliant' AND summary='We do not use personal information for AI model training and we contractually prohibit our vendors from using this information for their own model training.')=1 THEN 'ok: fireflies.ai' ELSE json('GUARD FAILED: fireflies.ai has changed; review again') END AS guard_target;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='zoom.com' AND compliance_status='compliant' AND summary='"Zoom does not use any of your audio, video, chat, screen sharing, attachments or other communications-like Customer Content (such as poll results, whiteboard and reactions) to train Zoom or third-party artificial intelligence models."')=1 THEN 'ok: zoom.com' ELSE json('GUARD FAILED: zoom.com has changed; review again') END AS guard_target;
INSERT INTO tools (name, domain, compliance_status, summary, data_retention, trains_on_user_data, gdpr_mentioned, source_urls, verified, auto_published, shared_domain, last_checked_at, opt_out_available, manual_override, sourced_from_archive)
VALUES ('Slack AI', 'slack.com', 'compliant_with_caveats', '"We do not develop generative AI models using Customer Data. To develop predictive models for features such as emoji and channel recommendations, our systems analyse Customer Data (e.g. messages, content and files) submitted to Slack as well as Other Information (including usage information)" "If you want to exclude your Customer Data from helping to train Slack global models, you can opt out." "To opt out, please have your org, workspace owners or primary owner contact our Customer Experience team at feedback@slack.com with your workspace/org URL and the subject line ''Slack global model opt-out request''." "Slack will not use Customer Data to train generative AI models unless Customer provides affirmative opt-in consent." Global predictive-model training is on by default; the workspace-level opt-out must be requested by an owner. Slack does not distinguish free vs paid here. Source has no page date; fetched 8 November 2026.', NULL, 1, NULL, '["https://slack.com/intl/en-gb/trust/data-management/privacy-principles"]', 1, 0, 0, '2026-11-08T18:06:01.777Z', 1, 1, 0);
UPDATE tools SET summary='We do not use personal information for AI model training and we contractually prohibit our vendors from using this information for their own model training. "We also impose a Zero Data Retention policy for meeting content, which includes audio, video, transcripts, and summaries of the meeting, and Fireflies Talk data. This means that your meeting content and Fireflies Talk data is not: (1) stored by any third-party vendor after processing; (2) accessed by any third-party vendor once the service is completed; or (3) used for training internal or external AI models."',
  data_retention='If you close your account, we will delete personal information related to your account within 30 days.',
  auto_published=0,
  manual_override=1,
  last_checked_at='2026-11-08T18:06:01.777Z',
  last_check_note=NULL,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='fireflies.ai' AND compliance_status='compliant';
UPDATE tools SET summary='Terms of Service (effective 11 August 2023): "Zoom does not use any of your audio, video, chat, screen sharing, attachments or other communications-like Customer Content (such as poll results, whiteboard and reactions) to train Zoom or third-party artificial intelligence models." Privacy Statement (last updated 17 September 2026): "Zoom does not use any of your audio, video, chat, screen sharing, attachments or other communications-like Customer Content (such as poll results, whiteboard and reactions) to train Zoom''s or its third-party artificial intelligence models."',
  auto_published=0,
  manual_override=1,
  last_checked_at='2026-11-08T18:06:01.777Z',
  last_check_note=NULL,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='zoom.com' AND compliance_status='compliant';
SELECT 'after' AS snapshot, domain, compliance_status, manual_override, summary, data_retention, source_urls FROM tools WHERE domain IN ('slack.com','fireflies.ai','zoom.com');
