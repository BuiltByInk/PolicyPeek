# Fact-check of 13 auto-published favourable verdicts (2026-09-19)

Scope: `frontend/data/tools.json` (dated 2026-09-18). Facts only; I assign no verdicts. "Supported" is judged against the CLAUDE.md definitions (compliant = no training, or opt-in/off by default; compliant_with_caveats = trains by default with a real AI-training opt-out; not_compliant = trains by default, no opt-out).

Method limit: WebFetch returns a summary from a small model, not raw page text, so every quote below is relayed and was not seen in raw HTML. Where two fetches disagreed I say so. OpenAI, Midjourney and Perplexity returned HTTP 403 on every path tried; web.archive.org is blocked. No alternate path worked, so nothing here says whether the backend fetcher would succeed.

## Summary table

| Tool | Stored verdict | Result | One-line reason |
|---|---|---|---|
| openai.com | compliant_with_caveats | COULD-NOT-VERIFY | Stored URL and 4 alternates all 403; stored URL is a regional ("row") policy |
| claude.com | compliant | UNCLEAR | Stored source covers commercial products only; consumer default not stated |
| cursor.com | compliant | UNCLEAR | /privacy says no training unless opted in; /data-use says Privacy Mode OFF (default) may train |
| elevenlabs.io | compliant_with_caveats | SUPPORTED | "may process ... to train" plus a real opt-out; stored quote is the wrong clause |
| fireflies.ai | compliant | SUPPORTED | Explicit no-training statement incl. meeting content and vendors |
| grammarly.com | compliant_with_caveats | UNCLEAR | Stored URL is superseded; current policy names a control but not the default |
| granola.ai | compliant | UNCLEAR | Trains on de-identified data with an opt-out; default for non-Enterprise not verbatim |
| kagi.com | compliant | UNCLEAR | Stored clause is hedged ("whenever possible"); firmer table is on an uncited page |
| midjourney.com | compliant_with_caveats | COULD-NOT-VERIFY | All Midjourney pages 403; stored quote is only a fragment |
| notion.com | compliant | UNSUPPORTED | Stored source's only clause covers Google Workspace API data, not customer content |
| perplexity.ai | compliant_with_caveats | COULD-NOT-VERIFY | All paths 403; a third party says the July 2026 notice dropped its opt-out text |
| sourcegraph.com | compliant | UNCLEAR | Stored notice covers only legacy pre-2025 Cody licences |
| you.com | compliant | UNSUPPORTED | Cited sentence covers only connected-service data and only third-party training |

## Per-tool evidence

### openai.com - COULD-NOT-VERIFY
Stored source https://openai.com/policies/row-privacy-policy/. Also 403: /policies/privacy-policy/, /policies/us-privacy-policy/, /policies/how-your-data-is-used-to-improve-model-performance/, and help.openai.com/en/articles/5722486. I read no OpenAI page.
Secondary only (search-result text): consumer training "enabled by default for Free, Plus, and Pro personal accounts", opt-out via "Improve the model for everyone"; Business, Enterprise and API not trained on by default. Consistent with the stored verdict, not verified.
Flags: "row" suggests a rest-of-world policy, and a separate US policy exists, so text may differ by region. Consumer/business split applies.

### claude.com - UNCLEAR
Stored source https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training (dated August 18, 2026).
Clause: "By default, we will not use your inputs or outputs from our commercial products (e.g. Claude for Work, Anthropic API, Claude Gov, etc.) to train our models." Exception: explicitly reported feedback/bugs. Consumer products (Free, Pro, Max) are "covered separately".
Consumer page, https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training (March 16, 2026): "We will use your chats and coding sessions ... if: You choose to allow us to use your chats and coding sessions to improve Claude"; also if safety-flagged, in explicit programs, or via thumbs feedback (kept "up to 5 years"). The default for new users is not stated there.
Flags: the stored quote is a commercial-tier guarantee shown on a consumer-facing site.

### cursor.com - UNCLEAR
Stored source https://cursor.com/privacy (effective October 6, 2025). Clause: "We do not use Inputs or Suggestions to train our models ... unless: (1) they are flagged for security review ..., (2) you explicitly report them to us ..., or (3) you've explicitly agreed to their use for such training purposes." It excludes commercial customers where Anysphere is a processor.
Conflict: https://cursor.com/data-use says "Privacy Mode OFF (default): we may use and store codebase data, prompts, editor actions, code snippets ... to improve our AI features and train our models"; ON: "Customer Data will not be used for training by Cursor." https://cursor.com/security: "When enabled, we will not train on your data." The fetch called OFF "default" while also saying per-plan defaults are unspecified. If OFF is the individual default, the stored verdict does not follow. Needs a direct read.

### elevenlabs.io - SUPPORTED
Stored source https://elevenlabs.io/privacy-policy (effective May 20, 2026).
Clauses: "We may process your Personal Data to research, develop, train and/or otherwise improve our AI models. This may include processing audio, text, video content ..." and "You may opt out of our use of your Personal Data for training at any time by navigating to the 'Data use' menu in the 'Terms and Privacy' section of your ElevenLabs account." Opt-out is not retroactive.
Flags: default-on is implied, not stated. The stored summary quote is about scraping public sites, not user content, so it is misattributed.

### fireflies.ai - SUPPORTED
Stored source https://fireflies.ai/privacy-policy (effective March 6, 2026).
Clauses: "We do not use personal information for AI model training and we contractually prohibit our vendors from using this information for their own model training." "Zero Data Retention policy for meeting content ... not ... used for training internal or external AI models." "We do not collect, use, or sell personal data for the purpose of training large language models." No opt-out needed; no tier split found. Two fetches agreed.

### grammarly.com - UNCLEAR
Stored source https://www.grammarly.com/privacy-policy-november-2024: "You are in control of whether your user content is used for training and improvement of our models", pointing to Technical Specifications; default not stated.
Current: https://www.grammarly.com/privacy-policy 301-redirects to https://superhuman.com/legal/privacy-policy (effective July 6, 2026; March 2025 listed as previous). It says "You can decide whether Superhuman can use your user content to train our AI models by adjusting the available training control(s) in your account settings." Default not stated.
Flags: stored source is stale; the policy now covers the company under a new name. Business, Education and managed Pro accounts are carved out. Since no page states the default, "trains by default" is not shown.

### granola.ai - UNCLEAR
Stored source https://docs.granola.ai/help-center/policies/privacy-policy (effective September 8, 2026).
Clauses: "We do not allow third parties such as OpenAI or Anthropic to use your Personal Data to train AI models." "We only use de-identified data to train AI models, which you can opt-out of within your Granola account settings. Enterprise Workspace Products have admin-enforced settings and are opted-out by default." Also "when you are opted in for us to do so" and "Enterprise users have model training turned off by default, but may opt-in."
Flags: Granola itself trains on de-identified derivatives; the Enterprise-off default implies non-Enterprise is on with an opt-out (that would be caveats, not plain compliant). Two fetches disagreed (one "appear to allow opt-in", one "ON by default"). Whether de-identified data is "user data" is a rules question; stored trains_on_user_data=false hides it. Consumer/Enterprise split applies.

### kagi.com - UNCLEAR
Stored source https://kagi.com/privacy (updated 2026-02-17).
Clause: "When using third party AI model providers, we are using privacy-respecting services that do not save the data or use it for training, whenever possible." The stored quote ("user data is only a liability") is a slogan, not a training clause.
Uncited page https://help.kagi.com/kagi/ai/llms-privacy.html: table "Trains on User Data via API" = "No" for every listed provider.
Flags: no statement found that Kagi trains its own models, but the cited page hedges.

### midjourney.com - COULD-NOT-VERIFY
Stored source https://docs.midjourney.com/hc/en-us/articles/32083472637453-Privacy-Policy; 403, as were the bare article ID, the Terms of Service article and midjourney.com/terms.
The stored quote "data collected through the process of training Midjourney machine learning algorithms" is a fragment from the Applicability section; a 2022 GitHub copy (https://github.com/adamkdean/midjourney-docs/blob/main/privacy-policy.md) has no training or opt-out clause.
Secondary only: search text quotes the Terms as "including training our models, unless you opt out of training through your account settings", while two other hits claim no consumer opt-out. Conflicting, unverified.

### notion.com - UNSUPPORTED (by the stored source)
Stored source https://www.notion.com/trust/privacy-policy (April 10, 2025). Only clause: "We do not process Workspace API user data to develop, improve, or train generalized AI and/or ML models." Per the fetch, that means Google Workspace data retrieved for Notion Mail. The policy lists "research and development" as a use and does not clearly exclude other content.
Uncited page https://www.notion.com/help/notion-ai-security-practices: "By default, Notion and its AI Subprocessors do not use Customer Data to train any models." That supports the verdict, but from a page the entry does not cite.
Flags: narrow clause presented as general.

### perplexity.ai - COULD-NOT-VERIFY
Stored source https://www.perplexity.ai/hub/legal/privacy-notice; 403, as were /privacy-policy, /terms-of-service and the help-center data-collection article. The stored quote ("Improve or create services and products, including our AI models.") is a generic purpose line, not a default/opt-out clause.
Secondary only: search text says training is on by default for Free/Pro/Max with an "AI data retention" toggle, Enterprise never trained on. A third-party post (https://venpo.com/blog/perplexity-moved-three-protections-out-of-its-privacy-policy) says a July 2, 2026 rewrite "no longer describes" the opt-out, though the setting remains in the product. If true, the opt-out is a product setting, not a policy commitment. Unverified.

### sourcegraph.com - UNCLEAR
Stored source https://sourcegraph.com/terms/cody-notice (effective February 15, 2024). Clause: "Sourcegraph and Sourcegraph Partner LLMs do not use code from Cody Enterprise or Cody Pro teams to train models." Also "Cody does not train on your code unless you provide permission."
Scope: "These terms apply to use of Cody, where (a) a license to use Cody features was granted prior to January 29, 2025, and (b) Cody was added to an Enterprise License which itself was granted prior to February 15, 2024."
Flags: enterprise-only, date-limited notice shown as the product's policy; newer licences are not covered on the page. The no-training text is clear for the covered group.

### you.com - UNSUPPORTED
Stored source https://you.com/privacy (effective December 10, 2024). Full clause: "Personal data collected through these services may include ... prompts, content created or shared by you, or feedback ... This data will not be used for developing, improving, or training third party AI and/or ML models." Per the fetch, "these services" are connected third-party services (Dropbox, Drive, SharePoint).
Flags: limited to connected-service data and third-party training. No statement found on You.com training its own models. Single fetch only.

## Most need a human look
1. cursor.com - two Cursor pages point opposite ways; read /privacy, /data-use, /security directly.
2. perplexity.ai - verdict rests on an opt-out a third party says left the notice; no Perplexity page readable.
3. openai.com and midjourney.com - no page readable; Midjourney secondary sources conflict.
4. granola.ai - page describes default-on de-identified training for non-Enterprise accounts.
5. notion.com and you.com - stored clause is narrower than the badge implies.
6. claude.com and sourcegraph.com - commercial or legacy-licence guarantee shown as the product's policy.
7. grammarly.com - stale source, rebranded policy, default unstated. kagi.com - probably fine, but the cited page hedges.
