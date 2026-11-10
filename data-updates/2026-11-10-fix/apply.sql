-- 10 Nov 2026 catalog fix: Mailchimp held (keep live not_compliant badge; remove no-opt-out line);
-- Meshy and Kling AI to compliant_with_caveats. Elliot OK 10 Nov 11:44 UK ("Yep" to 'fix all three').
-- Steward: factcheck-recheck-2026-11-10.md (quotes and dates from that ruling and its snapshots).
-- manual_override=1 so later pipeline runs do not overwrite these rows.
-- Guards bind to the current live target rows. Updates only these 3 rows; tools COUNT must stay 66.
-- A failed GUARD rolls back the whole file (wrangler D1 batch).
SELECT 'before_snapshot' AS snapshot, * FROM tools WHERE domain IN ('mailchimp.com','meshy.ai','kling.ai') ORDER BY domain;
SELECT 'before_count' AS snapshot, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: tools count is 66' ELSE json('GUARD FAILED: tools count is not 66') END AS guard_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='not_compliant' AND summary='Terms say "We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model"; no opt-out found.')=1 THEN 'ok: mailchimp.com' ELSE json('GUARD FAILED: mailchimp.com has changed; review again') END AS guard_target;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='meshy.ai' AND compliance_status='not_compliant' AND summary='Terms (Sep 19, 2026): "Meshy may use Customer Inputs and Customer Outputs ... from non-Enterprise Customers to train, validate, test, or improve Services unless otherwise agreed to in the Order." No opt-out for Free/Pro.')=1 THEN 'ok: meshy.ai' ELSE json('GUARD FAILED: meshy.ai has changed; review again') END AS guard_target;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='kling.ai' AND compliance_status='not_compliant' AND summary='"Kling AI may process usage data, aggregated data, or Input for its lawful business purposes" including to "(f) create, test, improve, train, or otherwise develop the artificial intelligence or machine learning models ... used by Kling AI"; no training opt-out in the terms or the privacy policy.')=1 THEN 'ok: kling.ai' ELSE json('GUARD FAILED: kling.ai has changed; review again') END AS guard_target;
UPDATE tools SET
  summary='"We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model, the Services, and similar products and features, and you instruct us to process Customer Data for such purposes. You may select preferences about your data by visiting your account settings." The only documented setting (Data analytics) never mentions AI, models or training, so it is not confirmed as a training opt-out. "Our data analytics projects use data from Mailchimp accounts to improve some of our most powerful features. We track things like your sending habits and subscriber details, so we can make more informed predictions, decisions, and products for our users. If you prefer not to share your data, you can opt out of data analytics." "To opt out, scroll to the Data analytics setting heading and uncheck the box next to Include my data in Mailchimp''s data analytics projects." Sources: Mailchimp Terms, updated 10 October 2025; Mailchimp help page Set account security options, no page date, fetched 10 November 2026.',
  source_urls='["https://mailchimp.com/legal/terms/", "https://mailchimp.com/help/set-account-security-options/"]',
  last_checked_at='2026-11-10T11:39:00.000Z',
  last_check_note=NULL,
  auto_published=0,
  manual_override=1,
  opt_out_available=0,
  trains_on_user_data=1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='mailchimp.com' AND compliance_status='not_compliant';
UPDATE tools SET
  compliance_status='compliant_with_caveats',
  summary='"Meshy may use Customer Inputs and Customer Outputs (collectively, "User Content") from non-Enterprise Customers to train, validate, test, or improve Services unless otherwise agreed to in the Order. You may opt out of such use by contacting support@meshy.ai." Training is on for Free/Pro unless you email support. Enterprise is not trained on under this clause. The opt-out is by email, not an in-product setting. Source: Meshy Terms of Use, last updated 19 September 2026.',
  source_urls='["https://www.meshy.ai/terms-of-use"]',
  last_checked_at='2026-11-10T11:39:00.000Z',
  last_check_note=NULL,
  auto_published=0,
  manual_override=1,
  opt_out_available=1,
  trains_on_user_data=1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='meshy.ai' AND compliance_status='not_compliant';
UPDATE tools SET
  compliance_status='compliant_with_caveats',
  summary='"Kling AI may process usage data, aggregated data, or Input for its lawful business purposes" including to "(f) create, test, improve, train, or otherwise develop the artificial intelligence or machine learning models, systems, architecture, weights or related technology used by Kling AI in connection with the Services." "If you do not wish us to continue using all or part of the Content, you may notify us to revoke the authorization by sending an email to support@kling.ai." That is a support-only revocation on a default-on licence. The revocation may not reach usage or aggregated data. The privacy policy says nothing about training. Sources: Kling AI User Policy and Privacy Policy, last updated / effective 21 April 2026.',
  source_urls='["https://kling.ai/docs/user-policy", "https://kling.ai/docs/privacy-policy"]',
  last_checked_at='2026-11-10T11:39:00.000Z',
  last_check_note=NULL,
  auto_published=0,
  manual_override=1,
  opt_out_available=1,
  trains_on_user_data=1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE domain='kling.ai' AND compliance_status='not_compliant';
SELECT 'after' AS snapshot, domain, compliance_status, manual_override, opt_out_available, trains_on_user_data, last_checked_at, source_urls, summary FROM tools WHERE domain IN ('mailchimp.com','meshy.ai','kling.ai') ORDER BY domain;
SELECT 'after_count' AS snapshot, COUNT(*) AS n FROM tools;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools)=66 THEN 'ok: tools count still 66' ELSE json('ASSERT FAILED: tools count changed') END AS assert_count;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE last_checked_at='2026-11-10T11:39:00.000Z')=3 THEN 'ok: only these 3 rows have this last_checked_at' ELSE json('ASSERT FAILED: unexpected last_checked_at set') END AS assert_scope;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='not_compliant' AND manual_override=1 AND opt_out_available=0 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary='"We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model, the Services, and similar products and features, and you instruct us to process Customer Data for such purposes. You may select preferences about your data by visiting your account settings." The only documented setting (Data analytics) never mentions AI, models or training, so it is not confirmed as a training opt-out. "Our data analytics projects use data from Mailchimp accounts to improve some of our most powerful features. We track things like your sending habits and subscriber details, so we can make more informed predictions, decisions, and products for our users. If you prefer not to share your data, you can opt out of data analytics." "To opt out, scroll to the Data analytics setting heading and uncheck the box next to Include my data in Mailchimp''s data analytics projects." Sources: Mailchimp Terms, updated 10 October 2025; Mailchimp help page Set account security options, no page date, fetched 10 November 2026.')=1 THEN 'ok: mailchimp.com' ELSE json('ASSERT FAILED: mailchimp.com') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='meshy.ai' AND compliance_status='compliant_with_caveats' AND manual_override=1 AND opt_out_available=1 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary='"Meshy may use Customer Inputs and Customer Outputs (collectively, "User Content") from non-Enterprise Customers to train, validate, test, or improve Services unless otherwise agreed to in the Order. You may opt out of such use by contacting support@meshy.ai." Training is on for Free/Pro unless you email support. Enterprise is not trained on under this clause. The opt-out is by email, not an in-product setting. Source: Meshy Terms of Use, last updated 19 September 2026.')=1 THEN 'ok: meshy.ai' ELSE json('ASSERT FAILED: meshy.ai') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='kling.ai' AND compliance_status='compliant_with_caveats' AND manual_override=1 AND opt_out_available=1 AND last_checked_at='2026-11-10T11:39:00.000Z' AND summary='"Kling AI may process usage data, aggregated data, or Input for its lawful business purposes" including to "(f) create, test, improve, train, or otherwise develop the artificial intelligence or machine learning models, systems, architecture, weights or related technology used by Kling AI in connection with the Services." "If you do not wish us to continue using all or part of the Content, you may notify us to revoke the authorization by sending an email to support@kling.ai." That is a support-only revocation on a default-on licence. The revocation may not reach usage or aggregated data. The privacy policy says nothing about training. Sources: Kling AI User Policy and Privacy Policy, last updated / effective 21 April 2026.')=1 THEN 'ok: kling.ai' ELSE json('ASSERT FAILED: kling.ai') END AS assert_row;
SELECT CASE WHEN (SELECT COUNT(*) FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain='meshy.ai' AND c.old_status='not_compliant' AND c.new_status='compliant_with_caveats')>=1 THEN 'ok: meshy.ai changelog' ELSE json('ASSERT FAILED: meshy.ai changelog') END AS assert_changelog;
SELECT CASE WHEN (SELECT COUNT(*) FROM compliance_changelog c JOIN tools t ON t.id=c.tool_id WHERE t.domain='kling.ai' AND c.old_status='not_compliant' AND c.new_status='compliant_with_caveats')>=1 THEN 'ok: kling.ai changelog' ELSE json('ASSERT FAILED: kling.ai changelog') END AS assert_changelog;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain='mailchimp.com' AND compliance_status='not_compliant')=1 THEN 'ok: mailchimp.com badge unchanged' ELSE json('ASSERT FAILED: mailchimp.com status changed') END AS assert_mailchimp_badge;
