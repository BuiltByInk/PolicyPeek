# Deep dive: Amazon Q Developer, Speechify, DeepL tier split

Research pass requested by Elliot on 2026-08-18 to unblock three tools stuck
in the admin pending-review queue with null `trains_on_user_data` and/or
`opt_out_available`. Findings only — no changes made to
`frontend/data/tools.json`, `research/tool_sources.json`, or any
`pending_checks`/admin data. Backend Agent should apply these once reviewed.

---

## 1. Amazon Q Developer

**Recommended `trains_on_user_data`: `true` (Free tier only) / `false` (Pro tier)**
**Recommended `opt_out_available`: `true`**

This one resolves cleanly — the generic AWS Privacy Notice was the wrong
document (too broad, product-agnostic), but Amazon Q Developer has its own
dedicated docs pages that answer both facts directly and explicitly.

### Training / data use
> "We may use certain content from Amazon Q Developer Free tier for service
> improvement. Amazon Q may use this content, for example, to provide better
> responses to common questions, fix Amazon Q operational issues, for
> de-bugging, or for model training... We do not use content from Amazon Q
> Developer Pro or Amazon Q Business for service improvement."

Source: [Amazon Q Developer service improvement](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/service-improvement.html) — AWS docs, "Amazon Q Developer Free tier content used for service improvement" section. Confirmed via direct fetch, not a search summary.

Same two-tier split pattern already flagged for GitHub Copilot / Grammarly /
DeepL in `research/tool_sources.json` — Free tier content (questions,
responses, generated code) can be used for service improvement *including
model training*; Pro tier and Amazon Q Business are excluded by policy,
stated in the same document.

### Opt-out
Confirmed dedicated, working opt-out mechanisms, split by data type and by
environment:

> "At the Amazon Q Developer Pro Tier, Amazon Q does not collect your
> content. At the Amazon Q Developer Free Tier, to opt out of sharing your
> content in VS Code... In the Settings search bar, enter `Amazon Q: Share
> Content`. Deselect the box."

Source: [Opt out of data sharing in the IDE and command line](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/opt-out-IDE.html) — AWS docs, "Opting out of sharing your content" section (per-IDE instructions for VS Code, JetBrains, Eclipse, Visual Studio, Cloud9, SageMaker, JupyterLab, CLI). Confirmed via direct fetch.

There's also an org-level route for console/chat-app usage:

> "For the AWS Management Console... and in chat applications, configure an
> AI services opt-out policy in AWS Organizations."

Same source doc, "How to opt out" section, linking to [AI services opt-out policies](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_ai-opt-out.html).

**Note for the badge/reviewer:** telemetry (usage metrics) and "content"
(actual code/prompts) are two separately toggled settings in each IDE — the
doc is explicit that toggling one doesn't toggle the other. The critical
fact for `opt_out_available` is the *content* toggle, not telemetry, and
that's confirmed present at the Free tier (Pro tier doesn't need it since
Pro never collects content in the first place).

**Not genuinely ambiguous** — recommend un-nulling both facts. Since Amazon
Q Developer as tracked in `research/tool_sources.json` doesn't currently
distinguish Free vs Pro as separate catalog entries, flag this the same way
as DeepL below: the training-use answer is Free-tier-specific, and Elliot
already set precedent (DeepL) that this product family should be rated on
its free tier for ICP-consistency reasons, which would make `true`/`true`
the right pair to publish, with a summary that notes Pro tier differs.

---

## 2. Speechify

**Recommended `trains_on_user_data`: still null — genuinely unresolved**
**Recommended `opt_out_available`: still null — genuinely unresolved (no mechanism found in any Speechify Inc. legal document)**

This one does *not* resolve cleanly, and I don't think it should be forced
to a value. Detail below on what was checked and why it stays ambiguous.

### What the Privacy Policy and ToS actually say
Speechify's Privacy Policy (`https://speechify.com/privacy/`) has one
explicit, narrow statement that AI training is *not* done with a specific
data source:

> "Data from Google Workspace APIs, including the Google Drive API (and any
> such data used with AI or machine learning features), is used only to
> provide user-facing features in Speechify. We do not use it to train
> generalized AI/ML models."

Source: [Privacy Policy | Speechify](https://speechify.com/privacy/), "Third-Party Links/Integrations" → Google User Data section.

That statement is scoped to Google Workspace/Drive data only. For the
policy's *general* data-use language (which would cover ordinary
text-to-speech/voice-typing usage — the bulk of what a casual user
actually does), the closest passages are:

> "To help us provide and administer our Site, Software, and/or Services...
> conduct research, develop new features, and improve the features,
> algorithms, and usability of our Site, Software, and/or Services."

Source: same page, "How does Speechify use my Information?" section.

> "...it may be viewed... to improve our algorithms as described in the
> User Content section of our Terms of Service."

Source: same page, "Does Speechify review User Content?" section.

Following that pointer into the Terms of Service
(`https://speechify.com/terms/`), the actual clause (Section 7, "USER
MATERIAL" — note: the privacy policy calls it "User Content," ToS calls it
"USER MATERIAL," same referent) reads:

> "We may use User Material for our internal business purposes, for
> example, to examine trends or categories or to promote, market or
> advertise Speechify. You acknowledge that we may commercially benefit
> from use of your User Material."

Source: [Terms of Service | Speechify](https://speechify.com/terms/), Section 7 "USER MATERIAL."

**This is the ambiguity**: "improve the features, algorithms... of our
Services" (privacy policy) and "internal business purposes... commercially
benefit" (ToS) are both broad enough to *plausibly* include AI model
training, but neither document uses the words "train," "AI," "machine
learning," or "model" in that clause — unlike the Google Workspace carve-out,
which does use that language explicitly (and only to say it does *not*
happen for that one data source). This is the same class of ambiguity
already flagged for Wordtune and Rev in `research/tool_sources.json` — a
policy that talks about "improving services" without confirming or denying
that means AI training specifically.

### Voice cloning / Custom Voice
Speechify's consumer app has a voice-cloning feature. The dedicated page
(`https://speechify.com/voice-cloning/`) only says:

> "Voice cloning allows you to upload or record a few seconds of any
> speaker, with the speaker's permission, and generate a clone of the
> voice."

No consent-flow detail, no statement on whether cloned-voice samples train
Speechify's broader models vs. only render that one user's clone, no
retention/deletion mechanism. This is a real gap for a product whose
premise is biometric voice data.

### The speechify.ai lookalike-adjacent domain — flagged, not used
Search results surfaced `speechify.ai/trust`, which explicitly states "We
never train models on your data" and looks at first glance like the
definitive answer. **I did not use this as a source.** The page's own
copyright notice reads "© 2026 SpeechifyAI" (not "Speechify Inc," the
entity named throughout speechify.com's Privacy Policy/ToS), and
`speechify.ai` markets itself as a distinct enterprise/API "Voice AI
Research Lab" / "SpeechifyAI Build" product (`docs.speechify.ai`) rather
than the consumer text-to-speech/voice-typing app at speechify.com that
`research/tool_sources.json` already scoped this catalog entry to. Whether
SpeechifyAI Inc is a corporate affiliate, a rebrand-in-progress, or simply
a similarly-named separate company was not confirmed either way in the time
available — same posture as the `characterai.cc` lookalike domain
explicitly rejected in the Character.AI entry: not fabricating a link
between the two without confirmation. I also saw a `speechify-app.com`
domain surface in search results (a "Privacy Policy - Speechify App" hit)
that is very likely an unrelated copycat/wrapper app, not Speechify Inc.'s
site — also not used.

### Verdict
Both facts should stay **null**, with the reason logged: the operative
clause ("improve the features, algorithms... of our Services" /
"commercially benefit from use of your User Material") is broad enough to
cover AI training but doesn't say so in as many words, and the one place
Speechify *does* use explicit "train... AI/ML models" language is scoped
narrowly to third-party Google Workspace data, which by implication leaves
the status of ordinary app data (text, voice recordings, cloned voices)
unstated rather than confirmed either way. No opt-out mechanism for AI
training use appears anywhere in the Privacy Policy or ToS (only marketing
opt-out and CCPA-rights opt-out are described). This is a case where
picking `true` or `false` would be rounding real ambiguity into false
confidence — recommend the admin reviewer see it flagged this way rather
than defaulted to null silently.

Sources checked (all speechify.com, confirmed genuine, no lookalikes used
as sources of record):
- https://speechify.com/privacy/
- https://speechify.com/terms/
- https://speechify.com/voice-cloning/
- https://speechify.com/blog/does-speechify-make-its-own-ai-voice-models/ (marketing blog, not a legal doc — checked but not usable as source of record; confirms Speechify trains its own voice models in-house but doesn't say what data source, i.e. doesn't resolve whether consumer-app user data is in the training set)
- https://speechify.com/blog/is-speechify-safe/ (marketing blog, same caveat — no AI-training disclosure)

---

## 3. DeepL tier split

**Recommended rating basis: free tier (per Elliot's 2026-08-18 confirmation, consistent with individual/casual-checker ICP)**

**Free tier `trains_on_user_data`: `true`**
**Free tier `opt_out_available`: `false` — no opt-out mechanism found for free-tier users**

**Paid/API tier (for the caveat text only, not what's rated): `trains_on_user_data: false`**

This confirms and sharpens what `research/tool_sources.json`'s existing
`deepl` entry already flagged qualitatively — here are the specific
tier-scoped source documents rather than just the general privacy policy.

### Free tier — training use
Privacy Policy, Section 3 ("Texts, Translations and Improvements - DeepL
Translator / Write (free version)"):

> "We process the content you upload and their translations or
> improvements for a limited period of time to train and improve our
> neural networks and algorithms."

Source: [DeepL Privacy Policy](https://www.deepl.com/en/privacy), Section 3.

This is corroborated by a second, tier-scoped document — the free-service
Terms of Use itself (not just the privacy policy):

> "...we reserve the right to process the content you upload... to train
> and improve our neural networks."

Source: [DeepL Free Services – Terms of Use](https://www.deepl.com/en/terms-of-use), "Processing of the submitted Content" section. Document is explicitly scoped: "Both private and business use of the DeepL Translator (free) and DeepL Write (free)... are free of charge" — confirms this document covers exactly the free tier and nothing else.

Neither document states a specific retention duration ("a limited period of
time" / "temporarily" — no concrete number of days), which is worth noting
but doesn't change the training-use fact.

### Free tier — opt-out
No opt-out mechanism for training use is described in either the Privacy
Policy or the Free Terms of Use. The only way to avoid this data use is to
use the paid tier instead (which is a tier change, not an opt-out setting)
— treat `opt_out_available` as `false` for the free tier, not null;
absence of any opt-out language across both governing documents is itself
the answer, not a gap in research.

### Paid/API tier — training use (for the caveat, not the rating)
Privacy Policy, Section 4 ("Texts and Improvements – DeepL Translator Pro /
DeepL API Pro / DeepL Write Pro"):

> "When using these services, your texts will not be used to improve the
> quality of our services."

Source: same [Privacy Policy](https://www.deepl.com/en/privacy), Section 4 — directly adjacent to and contrasting with Section 3, confirming this is a deliberate two-tier structure in DeepL's own document, not an inference.

Confirmed independently in DeepL's Pro License Agreement:

> "DeepL will only temporarily store Content or Processed Content to the
> extent technically required to provide its Services." (Section 3.1.2)
>
> "...the non-exclusive worldwide right to use the Content, Processed
> Content and/or Customer Training Data solely in order to provide DeepL's
> Services to Customer." (Section 7.4)

Source: [DeepL Pro License Agreement](https://www.deepl.com/en/pro-license). Note: "Customer Training Data" here is a defined term for a customer's own glossaries/custom terminology used only for that customer's own translations — not DeepL's general model training — so this doesn't contradict the "not used to improve our services" statement in the privacy policy; if anything it sharpens it.

Also independently corroborated by DeepL's own Help Center coverage of
adjacent Pro-only features:

> Saved translations under a Pro/team subscription "will never be used to
> train the DeepL language models."

Source: [Use the saved translations feature with a team subscription – DeepL Help Center](https://support.deepl.com/hc/en-us/articles/12726095650332-Use-the-saved-translations-feature-with-a-team-subscription) (via search-result summary; page itself returned 403 on direct fetch attempts through this pipeline's WebFetch, so treat this one citation as secondary/corroborating rather than primary — the Privacy Policy Section 4 and Pro License Agreement above are the primary sources).

### Suggested badge summary/reason string

> "Rated on DeepL's free tier: free-tier submissions are used to train and
> improve DeepL's models with no opt-out available. DeepL Pro / API tier
> uses a different policy — Pro/API submissions are explicitly excluded
> from model training and improvement."

(Keep it to one line if the UI needs shorter — minimal version: "Free tier
only: free submissions train DeepL's models, no opt-out; DeepL Pro/API is
excluded from training.")

---

## Summary for handoff

| Tool | `trains_on_user_data` | `opt_out_available` | Status |
|---|---|---|---|
| Amazon Q Developer | `true` (Free tier; `false` for Pro) | `true` | Resolved — dedicated AWS docs pages answer both facts directly |
| Speechify | still `null` | still `null` | Genuinely unresolved — policy language is broad/ambiguous, not silent; recommend keeping null and logging why rather than guessing |
| DeepL (free tier, per ICP) | `true` | `false` | Resolved — confirmed in both the free Terms of Use and Privacy Policy Section 3, contrasted directly against Section 4 (Pro) and the Pro License Agreement |

None of `frontend/data/tools.json`, `research/tool_sources.json`, or any
`pending_checks`/admin queue data was modified by this pass — findings only,
per the Research Agent's role boundary (publishing/updating catalog data is
Backend Agent's job after human review).
