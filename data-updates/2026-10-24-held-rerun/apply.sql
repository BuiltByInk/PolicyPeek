-- PolicyPeek 2026-10-24 held-tool rerun. PREPARED ONLY, NOT RUN. See README.md for the run order.
-- Inserts 15 tools whose fixed-checker verdict (dry run 24 Oct) matches the fact-checked / Research verdict,
-- each pinned with manual_override = 1. Expected: 44 -> 59 tools.
-- Atomicity: D1 runs a --file as one batch; any GUARD/ASSERT failure (json() on invalid text) rolls back everything.

-- 1. BEFORE SNAPSHOT (expected empty: none of these domains exist yet)
SELECT 'before_snapshot' AS snapshot, id, domain, compliance_status, trains_on_user_data, opt_out_available, summary, source_urls,
       sourced_from_archive, auto_published, manual_override, last_checked_at, last_check_note, updated_at
FROM tools WHERE domain IN ('deepseek.com', 'ahrefs.com', 'mailchimp.com', 'pictory.ai', 'pika.art', 'kling.ai', 'suno.com', 'remove.bg', 'invideo.io', 'buffer.com', 'poe.com', 'base44.com', 'meshy.ai', 'moises.ai', 'tldv.io') ORDER BY domain;
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT 'queued_rechecks' AS snapshot, id, domain, status, created_at FROM pending_checks
WHERE status IN ('pending','extracted') AND domain IN ('deepseek.com', 'ahrefs.com', 'mailchimp.com', 'pictory.ai', 'pika.art', 'kling.ai', 'suno.com', 'remove.bg', 'invideo.io', 'buffer.com', 'poe.com', 'base44.com', 'meshy.ai', 'moises.ai', 'tldv.io');

-- 2. GUARDS
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN ('deepseek.com', 'ahrefs.com', 'mailchimp.com', 'pictory.ai', 'pika.art', 'kling.ai', 'suno.com', 'remove.bg', 'invideo.io', 'buffer.com', 'poe.com', 'base44.com', 'meshy.ai', 'moises.ai', 'tldv.io')) = 0
  THEN 'ok: none of the 15 domains exist yet' ELSE json('GUARD FAILED: a target domain is already in tools') END AS guard_absent;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools) = 44
  THEN 'ok: 44 tools before' ELSE json('GUARD FAILED: live tool count is not 44') END AS guard_count;

-- 3. INSERTS
-- DeepSeek: compliant_with_caveats
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'DeepSeek', 'deepseek.com', 'compliant_with_caveats', 1, 1, '["https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html"]', 1, 0, 0, 0, 'Uses Inputs and Outputs to improve its services; "you can opt out by turning off "Improve the model for everyone"."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'deepseek.com');
-- Ahrefs: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Ahrefs', 'ahrefs.com', 'not_compliant', 1, 0, '["https://ahrefs.com/legal/terms"]', 1, 0, 0, 0, 'Terms say "we may use User Content, including any content you provide to us in connection with your use of AI Tools, to train our machine learning models"; no opt-out found.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'ahrefs.com');
-- Mailchimp: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Mailchimp', 'mailchimp.com', 'not_compliant', 1, 0, '["https://mailchimp.com/legal/terms/"]', 1, 0, 0, 0, 'Terms say "We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model"; no opt-out found.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'mailchimp.com');
-- Pictory AI: compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Pictory AI', 'pictory.ai', 'compliant', 0, 0, '["https://pictory.ai/terms-of-service"]', 1, 0, 0, 0, '"Pictory will not use your Customer Content or Pictoried Content to train or fine-tune its general artificial intelligence or machine learning models, except as expressly agreed by you in writing."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'pictory.ai');
-- Pika: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Pika', 'pika.art', 'not_compliant', 1, 0, '["https://pika.art/terms-of-service"]', 1, 0, 0, 0, '"Pika may use anonymized or aggregated Content, including Inputs, Outputs, and your interactions with the Service, and Usage Data to train, improve, and develop its machine learning models"; no training opt-out found.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'pika.art');
-- Kling AI: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Kling AI', 'kling.ai', 'not_compliant', 1, 0, '["https://kling.ai/docs/user-policy"]', 1, 0, 0, 0, '"Kling AI may process usage data, aggregated data, or Input for its lawful business purposes" including to "(f) create, test, improve, train, or otherwise develop the artificial intelligence or machine learning models ... used by Kling AI"; no training opt-out in the terms or the privacy policy.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'kling.ai');
-- Suno: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Suno', 'suno.com', 'not_compliant', 1, 0, '["https://suno.com/privacy"]', 1, 0, 0, 0, 'Uses Submissions and other Content "to train and enhance the models that power our Services". No training opt-out is stated.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'suno.com');
-- Remove.bg: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Remove.bg', 'remove.bg', 'not_compliant', 1, 0, '["https://www.remove.bg/privacy"]', 1, 0, 0, 0, '"We may also analyze your activity, content, media uploads and related data in your account ... to train our algorithms, models and AI products and services using machine learning to develop, improve and provide our Service." The only opt-outs offered are analytics and marketing.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'remove.bg');
-- InVideo: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'InVideo', 'invideo.io', 'not_compliant', 1, 0, '["https://invideo.io/privacy-policy/"]', 1, 0, 0, 0, '"We may use your User Data to train, fine-tune or otherwise adjust the parameters of our artificial intelligence and machine-learning models. You can stop this use by deleting the relevant User Data or closing your account". There''s no setting to opt out.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'invideo.io');
-- Buffer: unrated
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Buffer', 'buffer.com', 'unrated', NULL, 0, '["https://buffer.com/ai-assistant"]', 1, 0, 0, 0, 'Asked "Does Buffer scrape my content to train the AI?", Buffer says text entered in AI Assistant "will be shared with OpenAI" but never states whether training happens; legal pages are silent.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'buffer.com');
-- Poe: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Poe', 'poe.com', 'not_compliant', 1, 0, '["https://poe.com/pages/privacy"]', 1, 0, 0, 0, '"Developers that create bots and apps on Poe using APIs may view and store your chats on their servers to train their models." Poe account settings cover model providers, not developers; no opt-out for developer training.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'poe.com');
-- Base44: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Base44', 'base44.com', 'not_compliant', 1, 0, '["https://base44.com/terms-of-service", "https://base44.com/privacy-policy"]', 1, 0, 0, 0, 'Terms licence Customer Data and Generated Output "for the purpose of maintaining, providing and improving the Platform", including to "(5) train Company software tools (e.g. artificial intelligence and machine learning models)"; no training opt-out.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'base44.com');
-- Meshy: not_compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Meshy', 'meshy.ai', 'not_compliant', 1, 0, '["https://www.meshy.ai/terms-of-use", "https://www.meshy.ai/privacy-policy"]', 1, 0, 0, 0, 'Terms (Sep 19, 2026): "Meshy may use Customer Inputs and Customer Outputs ... from non-Enterprise Customers to train, validate, test, or improve Services unless otherwise agreed to in the Order." No opt-out for Free/Pro.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'meshy.ai');
-- Moises: compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'Moises', 'moises.ai', 'compliant', 0, 0, '["https://moises.ai/terms/", "https://moises.ai/privacy/"]', 1, 0, 0, 0, '"MOISES DOES NOT HAVE THE RIGHT TO AND WILL NOT USE YOUR USER CONTENT OR OUTPUT TO TRAIN OR FINE-TUNE ARTIFICIAL INTELLIGENCE OR MACHINE LEARNING MODELS UNLESS YOU HAVE EXPRESSLY AUTHORIZED SUCH USE IN WRITING OR VIA AN ELECTRONIC OPT-IN MECHANISM."', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'moises.ai');
-- tl;dv: compliant
INSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,
  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)
SELECT 'tl;dv', 'tldv.io', 'compliant', 0, 0, '["https://tldv.io/privacy/"]', 1, 0, 0, 0, '"Tldx Solutions GmbH does not use Customer Content, including meeting recordings, transcripts, notes, files, or other data processed through the Services, to train, fine-tune, or improve foundation models, large language models, or other generative AI models".', strftime('%Y-%m-%dT%H:%M:%fZ','now'), NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = 'tldv.io');

-- 4. VERIFICATION
SELECT 'after' AS v, domain, compliance_status, manual_override, trains_on_user_data, opt_out_available, source_urls
FROM tools WHERE domain IN ('deepseek.com', 'ahrefs.com', 'mailchimp.com', 'pictory.ai', 'pika.art', 'kling.ai', 'suno.com', 'remove.bg', 'invideo.io', 'buffer.com', 'poe.com', 'base44.com', 'meshy.ai', 'moises.ai', 'tldv.io') ORDER BY domain;
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;

-- 5. ASSERTS
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN ('deepseek.com', 'ahrefs.com', 'mailchimp.com', 'pictory.ai', 'pika.art', 'kling.ai', 'suno.com', 'remove.bg', 'invideo.io', 'buffer.com', 'poe.com', 'base44.com', 'meshy.ai', 'moises.ai', 'tldv.io') AND manual_override = 1 AND verified = 1
                  AND compliance_status = CASE domain WHEN 'deepseek.com' THEN 'compliant_with_caveats' WHEN 'ahrefs.com' THEN 'not_compliant' WHEN 'mailchimp.com' THEN 'not_compliant' WHEN 'pictory.ai' THEN 'compliant' WHEN 'pika.art' THEN 'not_compliant' WHEN 'kling.ai' THEN 'not_compliant' WHEN 'suno.com' THEN 'not_compliant' WHEN 'remove.bg' THEN 'not_compliant' WHEN 'invideo.io' THEN 'not_compliant' WHEN 'buffer.com' THEN 'unrated' WHEN 'poe.com' THEN 'not_compliant' WHEN 'base44.com' THEN 'not_compliant' WHEN 'meshy.ai' THEN 'not_compliant' WHEN 'moises.ai' THEN 'compliant' WHEN 'tldv.io' THEN 'compliant' END) = 15
  THEN 'ok: all 15 rows inserted' ELSE json('ASSERT FAILED: not every target row was inserted') END AS assert_rows;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE summary LIKE '%email%protected%') = 0
  THEN 'ok: no Cloudflare email artefact' ELSE json('ASSERT FAILED: email artefact left') END AS assert_email;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools) = 59
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant_with_caveats') = 17
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'compliant') = 14
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'unrated') = 8
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_compliant') = 15
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'shared_domain_unverified') = 4
  AND (SELECT COUNT(*) FROM tools WHERE compliance_status = 'not_ai_tool') = 1
  THEN 'ok: 59 tools, totals 17/14/8/15/4/1' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
