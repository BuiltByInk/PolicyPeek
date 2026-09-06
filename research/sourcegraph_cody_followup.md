# Sourcegraph Cody — fact-finding follow-up (2026-09-06)

Fact-finding only, per Phase 2.5d Part 2. Nothing published, approved, or
rejected. This exists to give Elliot primary-source text for his own call
on the stuck fact disagreement (existing catalog entry says
`trains_on_user_data: true`, rated `compliant`; a fresh extraction pass
returned `trains_on_user_data: null`).

## Where the "existing entry" actually lives

Checked real D1 first (`wrangler d1 execute --remote`, read-only): **no
`sourcegraph.com` row exists in the live `tools` table at all** (31/31
rows read, none match). The "existing entry" referenced by this task lives
in the hand-edited static file, `frontend/data/tools.json`:

```json
{
  "name": "Sourcegraph Cody",
  "domain": "sourcegraph.com",
  "compliance_status": "compliant",
  "summary": "We derive Usage Data from your use of the Services to help us operate, maintain, and improve the Services.",
  "trains_on_user_data": true,
  "gdpr_mentioned": false,
  "source_urls": ["https://sourcegraph.com/terms/privacy"],
  "verified": true
}
```

Worth flagging on its own: `trains_on_user_data: true` paired with
`compliance_status: "compliant"` doesn't match current `rules.ts` — that
combination (trains by default, no stated opt-out) should compute to
`not_compliant`, and "trains by default with a real opt-out" should be
`compliant_with_caveats`, not plain `compliant`. This entry predates both
the `compliant_with_caveats` bucket (2026-08-18) and, it looks like, ever
having a verdict `rules.ts` would derive from these facts today. Separate
from the training-fact question below, but Elliot should know the
verdict-bucket mismatch exists regardless of how the fact question
resolves.

I couldn't find a `pending_check #43` row on either real D1 or local dev
D1 (both queried; local dev D1's `pending_checks` was empty after this
session's own harness cleanup, and real D1 has zero `pending_checks` rows
for any `sourcegraph` domain). If that ID matters specifically, it may
have existed only in local dev D1 before Phase 2 moved to real D1
(2026-09-01) and wasn't part of the migrated data — flagging rather than
guessing.

## Sources checked directly

**Method note:** direct `WebFetch` against every `sourcegraph.com` URL
below returned HTTP 403 (apex and every subpath tried, including
`docs.sourcegraph.com`, which 302-redirects back into `sourcegraph.com`)
— looks like bot-protection blocking the fetch, not a page-specific issue.
`web.archive.org` is also not fetchable from this environment. I read the
actual current live text via a text-extraction reader proxy
(`r.jina.ai/<url>`) instead of a cache or a paraphrase — this still reads
today's live HTML, just through a different HTTP path than a direct
request. Flagging this because it's a real methodology deviation from "no
cache," even though the content itself is live, not archived. **This
403-everywhere behavior is itself a relevant data point** — if the
backend's own fetcher hit the same wall, that alone would explain a fresh
extraction returning `null` (no usable content reached the LLM), separate
from any question about what the policy actually says.

### 1. `https://sourcegraph.com/terms/privacy` (the one URL in both `tools.json.source_urls` and `research/tool_sources.json.privacy_policy`)

- The words **"train" / "training" do not appear anywhere on this page.**
- **"Cody" appears exactly once**, inside a Usage Data definition list:
  > "AI feature usage (including types of Inputs submitted, prompt
  > titles, prompt categories, query-derived metadata, and interaction
  > patterns), deployment information, system configuration data, session
  > data, operational signals, and service health metrics"
  — listed as a category of data collected, with **no statement about
  what it's used for regarding model training.**
- Retention clause (heading "Data Storage, Security, and Retention"):
  > "We retain your personal data for as long as necessary to perform our
  > contractual obligations and provide the Services to you and your
  > organization. When personal data is no longer necessary for these
  > purposes, we delete it in accordance with our data retention
  > policies, though we may retain certain information necessary to
  > attribute work product to and maintain the integrity of the
  > organizational workspace. We may also retain personal data as
  > necessary to comply with our legal, tax, audit, and accounting
  > obligations, to resolve disputes, to preserve our legal rights, or to
  > enforce our agreements."

**This page genuinely does not answer the training question** — the
`tools.json` summary field's quote ("We derive Usage Data... to operate,
maintain, and improve the Services") is generic service-improvement
boilerplate from this same page, not a training-specific statement. A
fresh, careful extraction returning `null` off *this specific page* looks
correct, not a regression — the original `trains_on_user_data: true` looks
like an over-read of vague language, the same failure pattern already
documented elsewhere in this project (Copilot/v0 unverified-reason work).

### 2. `https://sourcegraph.com/terms` (general ToS, also on file)

- Neither "Cody" nor "train"/"training" appears on this page at all.
- It references, but doesn't inline, an "AI Terms of Use" supplemental
  document and a separate DPA — this is the actual on-point document (see
  #4 below), and it is **not listed anywhere in `research/tool_sources.json`
  or `tools.json`**.

### 3. `https://sourcegraph.com/security` (the trust-center page on file)

- Neither "Cody" nor "train"/"training" appears here either. One
  retention detail unrelated to the training question: "Logs are stored
  in GCP and the information is retained for up to 365 days."

### 4. `https://sourcegraph.com/terms/cody-notice` — found via search, NOT in `research/tool_sources.json` or `tools.json.source_urls`

This is Sourcegraph's Cody-specific legal notice (also indexed as "Cody
Enterprise Terms of Use"). It is the actual page that answers the
question the other three don't:

- **Cody Free & Pro:** "No, Cody does not train on your code unless you
  provide permission. Our third-party Language Model (LLM) providers do
  not train on your specific codebase."
- **Cody Enterprise:** "Sourcegraph and Sourcegraph Partner LLMs do not
  use code from Cody Enterprise or Cody Pro teams to train models."
- **Sourcegraph.com (non-enterprise) prompts/responses:** collected, but
  "none of it will be used to train any generally available models."
- **Opt-in, not opt-out, for the one training exception:** Sourcegraph
  "may fine-tune a custom model solely for your proprietary use if you
  purchase that service" — an explicit paid opt-in add-on, not a default
  a user has to find and turn off.
- **Retention (section "Zero-Retention Data-Sharing with LLMs"):**
  "Sourcegraph Partner LLMs will not retain any input or output from the
  model, including embeddings, beyond the time it takes to generate the
  output."
- No effective/last-updated date is shown on the page.

## Plain statement on the three hypotheses

Mostly **(b), with a dose of (a)**:

- **(b) under-scoped source, confirmed**: neither the original nor the
  fresh extraction was ever pointed at `/terms/cody-notice`, which is the
  one page that actually and unambiguously answers this question. Both
  passes used `/terms/privacy`, which doesn't discuss training in any
  actionable way. This is a sourcing-file gap (`research/tool_sources.json`
  is missing this URL entirely), not a code bug in either extraction run.
- **(a) also plausible for the *original* fact, separately**: even judged
  only against `/terms/privacy` (the page it was actually extracted from),
  `trains_on_user_data: true` doesn't look supportable from that page's
  actual text — it reads like an inference from generic "improve the
  Services" language rather than a specific training clause. I can't rule
  out that the original extraction predates a policy change (no archived
  snapshot from that far back was reachable in this pass), but the
  current page's plain text doesn't obviously support the original
  fact either way.
- **(c) genuinely ambiguous/silent**: not the case — once pointed at the
  right page, the current policy is specific and unambiguous: no training
  by default on any Cody tier, with an explicit paid opt-in exception, and
  zero-retention with LLM partners.

Not making the call here per the task's scope, but noting for whichever
way Elliot decides: if `/terms/cody-notice` is accepted as the correct
source, the facts it supports (`trains_on_user_data: false`, real
opt-in-only exception, zero LLM retention) point toward `compliant` under
current `rules.ts` — closer to the *verdict* the stale entry already has,
even though the stale entry's own stated *reasoning* doesn't hold up and
its source URL is wrong.
