#!/usr/bin/env python3
"""Generates ../apply.sql: INSERT the 15 held/approved tools the fixed checker agrees on (dry run 24 Oct)."""
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
TJ = json.load(open(os.path.join(HERE, "../../../frontend/data/tools.json")))
q = lambda s: "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"
b = lambda v: "NULL" if v is None else str(int(v))
C, NC, OK, UN = "compliant_with_caveats", "not_compliant", "compliant", "unrated"
# domain: (name, status, trains, opt_out, summary, source_urls)
T = {
 "deepseek.com": ("DeepSeek", C, 1, 1, 'Uses Inputs and Outputs to improve its services; "you can opt out by turning off "Improve the model for everyone"."', ["https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html"]),
 "ahrefs.com": ("Ahrefs", NC, 1, 0, 'Terms say "we may use User Content, including any content you provide to us in connection with your use of AI Tools, to train our machine learning models"; no opt-out found.', ["https://ahrefs.com/legal/terms"]),
 "mailchimp.com": ("Mailchimp", NC, 1, 0, 'Terms say "We may use your Inputs and Outputs, including Customer Data, for machine learning purposes in order to develop and improve the AI Model"; no opt-out found.', ["https://mailchimp.com/legal/terms/"]),
 "pictory.ai": ("Pictory AI", OK, 0, 0, '"Pictory will not use your Customer Content or Pictoried Content to train or fine-tune its general artificial intelligence or machine learning models, except as expressly agreed by you in writing."', ["https://pictory.ai/terms-of-service"]),
 "pika.art": ("Pika", NC, 1, 0, '"Pika may use anonymized or aggregated Content, including Inputs, Outputs, and your interactions with the Service, and Usage Data to train, improve, and develop its machine learning models"; no training opt-out found.', ["https://pika.art/terms-of-service"]),
 "kling.ai": ("Kling AI", NC, 1, 0, '"Kling AI may process usage data, aggregated data, or Input for its lawful business purposes" including to "(f) create, test, improve, train, or otherwise develop the artificial intelligence or machine learning models ... used by Kling AI"; no training opt-out in the terms or the privacy policy.', ["https://kling.ai/docs/user-policy"]),
 "suno.com": ("Suno", NC, 1, 0, 'Uses Submissions and other Content "to train and enhance the models that power our Services". No training opt-out is stated.', ["https://suno.com/privacy"]),
 "remove.bg": ("Remove.bg", NC, 1, 0, '"We may also analyze your activity, content, media uploads and related data in your account ... to train our algorithms, models and AI products and services using machine learning to develop, improve and provide our Service." The only opt-outs offered are analytics and marketing.', ["https://www.remove.bg/privacy"]),
 "invideo.io": ("InVideo", NC, 1, 0, '"We may use your User Data to train, fine-tune or otherwise adjust the parameters of our artificial intelligence and machine-learning models. You can stop this use by deleting the relevant User Data or closing your account". There\'s no setting to opt out.', ["https://invideo.io/privacy-policy/"]),
 "buffer.com": ("Buffer", UN, None, 0, 'Asked "Does Buffer scrape my content to train the AI?", Buffer says text entered in AI Assistant "will be shared with OpenAI" but never states whether training happens; legal pages are silent.', ["https://buffer.com/ai-assistant"]),
 "poe.com": ("Poe", NC, 1, 0, '"Developers that create bots and apps on Poe using APIs may view and store your chats on their servers to train their models." Poe account settings cover model providers, not developers; no opt-out for developer training.', ["https://poe.com/pages/privacy"]),
 "base44.com": ("Base44", NC, 1, 0, 'Terms licence Customer Data and Generated Output "for the purpose of maintaining, providing and improving the Platform", including to "(5) train Company software tools (e.g. artificial intelligence and machine learning models)"; no training opt-out.', ["https://base44.com/terms-of-service", "https://base44.com/privacy-policy"]),
 "meshy.ai": ("Meshy", NC, 1, 0, 'Terms (Sep 19, 2026): "Meshy may use Customer Inputs and Customer Outputs ... from non-Enterprise Customers to train, validate, test, or improve Services unless otherwise agreed to in the Order." No opt-out for Free/Pro.', ["https://www.meshy.ai/terms-of-use", "https://www.meshy.ai/privacy-policy"]),
 "moises.ai": ("Moises", OK, 0, 0, '"MOISES DOES NOT HAVE THE RIGHT TO AND WILL NOT USE YOUR USER CONTENT OR OUTPUT TO TRAIN OR FINE-TUNE ARTIFICIAL INTELLIGENCE OR MACHINE LEARNING MODELS UNLESS YOU HAVE EXPRESSLY AUTHORIZED SUCH USE IN WRITING OR VIA AN ELECTRONIC OPT-IN MECHANISM."', ["https://moises.ai/terms/", "https://moises.ai/privacy/"]),
 "tldv.io": ("tl;dv", OK, 0, 0, '"Tldx Solutions GmbH does not use Customer Content, including meeting recordings, transcripts, notes, files, or other data processed through the Services, to train, fine-tune, or improve foundation models, large language models, or other generative AI models".', ["https://tldv.io/privacy/"]),
}
live = {t["domain"] for t in TJ}
assert not (set(T) & live), set(T) & live
before = collections.Counter(t["compliance_status"] for t in TJ)
after = before + collections.Counter(v[1] for v in T.values())
ORDER = [C, OK, UN, NC, "shared_domain_unverified", "not_ai_tool"]
inl = ", ".join(q(d) for d in T)
NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
s = f"""-- PolicyPeek 2026-10-24 held-tool rerun. PREPARED ONLY, NOT RUN. See README.md for the run order.
-- Inserts {len(T)} tools whose fixed-checker verdict (dry run 24 Oct) matches the fact-checked / Research verdict,
-- each pinned with manual_override = 1. Expected: {len(TJ)} -> {len(TJ)+len(T)} tools.
-- Atomicity: D1 runs a --file as one batch; any GUARD/ASSERT failure (json() on invalid text) rolls back everything.

-- 1. BEFORE SNAPSHOT (expected empty: none of these domains exist yet)
SELECT 'before_snapshot' AS snapshot, id, domain, compliance_status, trains_on_user_data, opt_out_available, summary, source_urls,
       sourced_from_archive, auto_published, manual_override, last_checked_at, last_check_note, updated_at
FROM tools WHERE domain IN ({inl}) ORDER BY domain;
SELECT 'before_counts' AS snapshot, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;
SELECT 'queued_rechecks' AS snapshot, id, domain, status, created_at FROM pending_checks
WHERE status IN ('pending','extracted') AND domain IN ({inl});

-- 2. GUARDS
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN ({inl})) = 0
  THEN 'ok: none of the {len(T)} domains exist yet' ELSE json('GUARD FAILED: a target domain is already in tools') END AS guard_absent;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools) = {len(TJ)}
  THEN 'ok: {len(TJ)} tools before' ELSE json('GUARD FAILED: live tool count is not {len(TJ)}') END AS guard_count;

-- 3. INSERTS
"""
for d, (name, st, tr, op, su, src) in T.items():
    s += (f"-- {name}: {st}\nINSERT INTO tools (name, domain, compliance_status, trains_on_user_data, opt_out_available, source_urls, verified, shared_domain,\n"
          f"  auto_published, sourced_from_archive, summary, last_checked_at, last_check_note, manual_override)\n"
          f"SELECT {q(name)}, {q(d)}, {q(st)}, {b(tr)}, {b(op)}, {q(json.dumps(src))}, 1, 0, 0, 0, {q(su)}, {NOW}, NULL, 1\n"
          f"WHERE NOT EXISTS (SELECT 1 FROM tools WHERE domain = {q(d)});\n")
cases = " ".join(f"WHEN {q(d)} THEN {q(v[1])}" for d, v in T.items())
tot = "\n  AND ".join(f"(SELECT COUNT(*) FROM tools WHERE compliance_status = '{k}') = {after[k]}" for k in ORDER)
s += f"""
-- 4. VERIFICATION
SELECT 'after' AS v, domain, compliance_status, manual_override, trains_on_user_data, opt_out_available, source_urls
FROM tools WHERE domain IN ({inl}) ORDER BY domain;
SELECT 'after_counts' AS v, compliance_status, COUNT(*) AS n FROM tools GROUP BY compliance_status ORDER BY compliance_status;

-- 5. ASSERTS
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE domain IN ({inl}) AND manual_override = 1 AND verified = 1
                  AND compliance_status = CASE domain {cases} END) = {len(T)}
  THEN 'ok: all {len(T)} rows inserted' ELSE json('ASSERT FAILED: not every target row was inserted') END AS assert_rows;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools WHERE summary LIKE '%email%protected%') = 0
  THEN 'ok: no Cloudflare email artefact' ELSE json('ASSERT FAILED: email artefact left') END AS assert_email;
SELECT CASE WHEN (SELECT COUNT(*) FROM tools) = {len(TJ)+len(T)}
  AND {tot}
  THEN 'ok: {len(TJ)+len(T)} tools, totals {"/".join(str(after[k]) for k in ORDER)}' ELSE json('ASSERT FAILED: final totals wrong') END AS assert_totals;
"""
open(os.path.join(HERE, "..", "apply.sql"), "w").write(s)
json.dump(sorted(T), open(os.path.join(HERE, "inserted_domains.json"), "w"))
print("wrote apply.sql;", len(TJ), "->", len(TJ)+len(T), {k: after[k] for k in ORDER})
