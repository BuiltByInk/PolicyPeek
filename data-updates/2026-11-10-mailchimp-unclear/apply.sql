-- 10 Nov 2026: Mailchimp to unrated (Policy unclear). Elliot OK 11:45 UK
-- ("Mailchimp to unclear"), relayed by Jump. Copies the live Policy unclear
-- cards (Buffer, Copy.ai): compliance_status=unrated, trains_on_user_data=NULL.
-- opt_out_available is NULL (Copy.ai; Buffer has 0). NULL avoids recording a
-- no-opt-out fact on an unclear card. manual_override=1.
-- Updates only mailchimp.com. Tools COUNT must stay 66.
-- A failed GUARD rolls back the whole file (wrangler D1 batch).
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain='mailchimp.com';
SELECT 'before_count' AS snapshot, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: tools count is 66' ELSE json('GUARD FAILED: tools count is not 66') END AS guard_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='not_compliant' AND summary='"We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model, the Services, and similar products and features, and you instruct us to process Customer Data for such purposes. You may select preferences about your data by visiting your account settings." The only documented setting (Data analytics) never mentions AI, models or training, so it is not confirmed as a training opt-out. "Our data analytics projects use data from Mailchimp accounts to improve some of our most powerful features. We track things like your sending habits and subscriber details, so we can make more informed predictions, decisions, and products for our users. If you prefer not to share your data, you can opt out of data analytics." "To opt out, scroll to the Data analytics setting heading and uncheck the box next to Include my data in Mailchimp''s data analytics projects." Sources: Mailchimp Terms, updated 10 October 2025; Mailchimp help page Set account security options, no page date, fetched 10 November 2026.')=1 THEN 'ok: mailchimp.com' ELSE json('GUARD FAILED: mailchimp.com has changed; review again') END AS guard_target;
UPDATE tools SET
  compliance_status='unrated',
  summary='"We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model, the Services, and similar products and features, and you instruct us to process Customer Data for such purposes. You may select preferences about your data by visiting your account settings." The only documented setting (Data analytics) never mentions AI, models or training. The published pages do not clearly say whether this use is on by default, or whether that setting would stop it. Sources: Mailchimp Terms, updated 10 October 2025; Mailchimp help page Set account security options, no page date, fetched 10 November 2026.',
  trains_on_user_data=NULL,
  opt_out_available=NULL,
  last_checked_at='2026-11-10T11:45:00.000Z',
  last_check_note=NULL,
  auto_published=0,
  manual_override=1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='mailchimp.com' AND compliance_status='not_compliant';
SELECT 'after' AS snapshot, domain, compliance_status, trains_on_user_data, opt_out_available, manual_override, last_checked_at, source_urls, summary FROM tools WHERE domain='mailchimp.com';
SELECT 'after_count' AS snapshot, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: tools count still 66' ELSE json('ASSERT FAILED: tools count changed') END AS assert_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE last_checked_at='2026-11-10T11:45:00.000Z')=1 THEN 'ok: only mailchimp.com has this last_checked_at' ELSE json('ASSERT FAILED: unexpected last_checked_at set') END AS assert_scope;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='unrated' AND trains_on_user_data IS NULL AND opt_out_available IS NULL AND manual_override=1 AND last_checked_at='2026-11-10T11:45:00.000Z' AND summary='"We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model, the Services, and similar products and features, and you instruct us to process Customer Data for such purposes. You may select preferences about your data by visiting your account settings." The only documented setting (Data analytics) never mentions AI, models or training. The published pages do not clearly say whether this use is on by default, or whether that setting would stop it. Sources: Mailchimp Terms, updated 10 October 2025; Mailchimp help page Set account security options, no page date, fetched 10 November 2026.')=1 THEN 'ok: mailchimp.com' ELSE json('ASSERT FAILED: mailchimp.com') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain='mailchimp.com' AND c.old_status='not_compliant' AND c.new_status='unrated')>=1 THEN 'ok: mailchimp.com changelog' ELSE json('ASSERT FAILED: mailchimp.com changelog') END AS assert_changelog;
