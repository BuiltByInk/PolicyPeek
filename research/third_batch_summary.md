# Third batch — 17 tools sourced, 2026-08-18

Research Agent pass, run per CLAUDE.md's "Growth Loop" weekly sourcing-pass
cadence for this role. Same rigor as the first two batches: every URL below
was found via WebSearch and then verified with a direct WebFetch wherever
possible — confirming the page actually loads and is genuinely that vendor's
policy/terms/security content, not pattern-matched from a guessed path.
Where direct WebFetch failed (see flags below), that's called out explicitly
rather than silently relying on WebSearch's summary as if it were an
independently confirmed fetch. Nothing here has been submitted through the
real pipeline (`POST /v1/check`) or touched `frontend/data/tools.json` —
sourcing only, same scope boundary as the first two batches.

**17 tools sourced, across 9 categories.** Full list with URLs in
`research/tool_list.md`'s "Third batch" section; full per-tool
privacy/ToS/DPA/trust-page URLs plus verification notes in
`research/tool_sources.json`.

This batch deliberately targeted gaps the first two batches left open: more
coding assistants/agents, meeting/note-taking tools, an AI browser, legal AI,
newer image/video-generation models, and two genuinely new categories for
this catalog (AI email, AI resume/job-search) — while staying inside the
individual/casual-checker ICP from CLAUDE.md (no enterprise-only B2B
infrastructure nobody signs up for solo).

## Read these things before running this batch through extraction

### 1. Devin (Cognition) is a sharper "disjoint domain" case than Bolt.new/StackBlitz

Product lives at `devin.ai`. Governing Privacy Policy/ToS/DPA all live on
`cognition.ai`/`cognition.com` (`cognition.ai/privacy-policy` 301-redirects
to `cognition.com/privacy-policy` — confirmed via direct fetch, used the
redirected URL as source of record). But it's not just two domains for one
product — Cognition's single privacy policy explicitly names **both** "Devin
and Windsurf" as covered software-as-a-service offerings. Cognition acquired
Windsurf (this corrects/extends the second batch's Windsurf entry, which had
already caught the Cognition acquisition but not this shared-policy detail).
So one legal document spans two differently-branded, differently-domained
consumer products: `devin.ai` and `windsurf.com`. Flagging per your
instruction not to try to resolve this myself — you and Elliot are already
discussing the general shape of this problem.

### 2. Perplexity Comet — same-vendor multi-product case on a shared apex domain

Comet (Perplexity's AI browser) has its own dedicated privacy notice at
`perplexity.ai/hub/legal/comet-privacy-notice`, distinct from the main
Perplexity Privacy Notice already sourced for the existing `perplexity`
catalog entry — genuinely different data flows (local/on-device browsing
data, site/service integration permissions) worth its own entry. But it
shares the `perplexity.ai` apex domain with that existing entry, so expect
the `shared_domain` heuristic to fire even though this isn't the AWS/Vercel
shape (unrelated products crammed onto one company's domain) — it's the same
company, same brand family, genuinely two products. Worth a reviewer's eye
on whether the heuristic should treat these cases differently.
Separately: direct WebFetch to the Comet privacy notice returned HTTP 403 on
two attempts; the facts cited for it are from WebSearch's summary of the
live page, not an independently confirmed raw fetch.

### 3. Pika's privacy policy is a client-rendered SPA — same failure mode as Character.AI

URLs (`pika.art/privacy-policy`, mirrored at `launch.pika.art/privacy-policy`)
are confirmed genuine — `pika.art` is the real Mellis, Inc. product domain
per multiple independent search results, and `launch.pika.art`/`dev.pika.art`
are Pika's own subdomains, not lookalikes. But WebFetch only ever received an
accordion table-of-contents and page footer, never the expanded clause text,
across two attempts. Could not confirm or deny AI-training-use language or an
opt-out mechanism as a result. If the backend's own fetcher hits the same JS
wall, expect null training-related facts — an honest reflection of an
extraction gap, not a thin source (same distinction made for Character.AI in
the second batch). Also checked and explicitly rejected a lookalike domain,
`pika-art.net` ("Pika AI: Free AI Video Generator") — not Mellis, Inc.'s site,
not used anywhere.

### 4. Two tools have tier-scoped compliance answers, same pattern as DeepL/GitHub Copilot

- **Gamma**: on plans without privacy controls enabled (i.e. Free by
  default), Gamma may use content to train/improve/refine its models; Team
  and Business plans don't train on content, and Business/Enterprise
  specifically guarantee zero data retention for training. (Direct WebFetch
  to `gamma.app/privacy` failed with HTTP 403 twice — this is sourced from
  WebSearch's summary only, flagged as lower-confidence than the rest of
  this batch's tier-split findings.)
- **Recraft**: a different axis of tier split than DeepL's — it's about
  content visibility/ownership, not model training. Free-tier generated
  images are public and Recraft-owned (may appear in the community gallery);
  paid-tier images are private and user-owned. The AI-training-use question
  itself (Recraft's own models may train on prompts/outputs by default) has
  a settings-level opt-out regardless of which tier you're on — so don't
  conflate the two axes when this reaches extraction.

### 5. Kling AI is this batch's lowest-confidence entry — flag for a follow-up pass

Every direct WebFetch attempt to `kling.ai/docs/privacy-policy` (and a
retry) returned HTTP 446, an unusual, non-standard status code — possibly a
geo-block or bot-block, not confirmed which. Everything cited for this tool
is from WebSearch's summary of the live pages, not an independently
confirmed raw fetch, unlike the rest of this batch. The entity name (Kling
AI Pte. Ltd) and URL structure (`kling.ai/docs/...`) both check out against
multiple independent search results, so the URLs themselves aren't guessed —
just the content behind them is unverified via direct fetch. China-based
parent company (Kuaishou) also raises international-data-transfer/GDPR-
adequacy questions worth a reviewer's attention beyond what this pass could
confirm. Recommend a follow-up direct-fetch attempt (different access path,
or a Wayback-snapshot fallback if that infrastructure exists by then) before
this one goes through extraction with any confidence.

## Notable individual flags (not blockers, just worth a reviewer's eye)

- **Continue.dev** — a WebSearch result title read "Continue (acquired by
  Cursor)" (from Y Combinator's own company page for Continue), suggesting a
  recent acquisition by Anysphere/Cursor (already a separate catalog entry).
  Not confirmed inside Continue's own privacy policy or terms (both fetched
  directly, neither mentions any acquisition), and not independently
  verified anywhere else in the time available. If true, this would
  eventually mirror the Devin/Windsurf/Cognition shape above: two
  differently-branded, differently-domained products under one owner —
  flagging now so it doesn't surface as a surprise later.
- **Black Forest Labs (FLUX)** — trains on inputs/outputs by default, but
  the opt-out is manual/friction-y (email `legal@blackforestlabs.ai` with a
  specific subject line and account details) rather than a settings toggle,
  same pattern as Fireflies.ai/HeyGen in the second batch, not the cleaner
  self-serve toggles seen elsewhere in this batch (Fathom, Recraft,
  Superhuman).
- **DoNotPay** — privacy policy dated August 22, 2023, never mentions AI
  model training, machine learning, or any AI-specific data use anywhere in
  the document — for a product whose entire premise is AI-generated legal
  correspondence and negotiation, this reads as another instance of the
  "stale template" pattern already flagged for Sudowrite in the second
  batch. Confirmed genuine, not fabricated or swapped for something newer.
- **Elicit** — privacy policy (dated September 12, 2023) never discusses
  whether uploaded research documents/queries are used to train AI models,
  in either direction. Stale relative to its own DPA (dated April 1, 2025) —
  same staleness-mismatch pattern already flagged for JetBrains AI Assistant
  in the second batch.
- **Teal** — direct WebFetch to `tealhq.com/privacy-policy` failed with HTTP
  403 twice; sourced via WebSearch summary only. That summary found no
  explicit statement either way on whether resume/career content trains
  Teal's AI features — a real gap worth flagging even accounting for the
  lower-confidence sourcing here, since it's exactly the fact this pipeline
  needs.
- **Zed** — one of the stronger privacy postures found across all three
  batches so far: Zero Data Retention agreements with Anthropic, Google,
  OpenAI, and xAI for hosted models, opt-in (not opt-out) by design for any
  data sharing, and Edit Prediction training-data sharing (when turned on)
  is limited to open-source code under permissive licenses.
- **Superhuman** — one of the cleanest opt-out mechanisms found across all
  three batches: explicit account-settings "training control(s)" toggle for
  whether Superhuman can use your content to train its AI models. Search
  also surfaced `joinsuperhuman.io` as a possibly-related domain; not
  confirmed as affiliated and not used as a source here.

## Skipped — 2 tools, not guessed

- **Cleo AI** (personal-finance AI assistant) — both
  `web.meetcleo.com/page/privacy-policy` and `cleoapps.com/privacy` returned
  HTTP 403 on every attempt (one retry each, per the established retry
  budget). Same domain-wide anti-bot pattern already documented for
  Leonardo.Ai/Writer.com/QuillBot in the second batch. `meetcleo.com` is
  confirmed as Cleo's real primary domain (matches App Store/Google Play
  metadata); `hicleo.com` and `cleoapps.com`'s exact relationship to it
  (rebrand? marketing shortlink? unrelated?) was not resolved either way in
  the time available, so neither was substituted in as a source of record.
- **Sora (OpenAI)** — considered, not included. It uses OpenAI's main
  privacy policy/terms — the same document already sourced for the existing
  `chatgpt` catalog entry — not a materially distinct product-specific legal
  document, so adding it as a separate entry would just duplicate an
  existing source rather than add real new catalog coverage (same reasoning
  applied to skip ChatGPT Atlas, which never made it past this same
  redundancy check to even appear in `tool_sources.json`). Also worth
  flagging for future sourcing passes: search surfaced `sorabyopenai.com`,
  which is **not** OpenAI's domain — a direct WebFetch attempt to it
  returned a connection error (`ECONNREFUSED`), consistent with it being an
  unaffiliated, low-quality site rather than a real OpenAI property. Not
  used anywhere as a source, same posture as the `krea-ai.com` and
  `characterai.cc` lookalikes rejected in the second batch.

## Categories deliberately not sourced

Per the ICP boundary explicit in both CLAUDE.md and this task's brief
("consumer-or-prosumer-facing AI/SaaS tools an individual would plug their
own data into, not enterprise-only B2B infrastructure nobody signs up for
solo"): dedicated **customer-support AI** (Intercom Fin, Zendesk AI, Ada,
Forethought) and **HR/recruiting AI** (Workday AI, Greenhouse AI, and
similar applicant-tracking-system AI add-ons) vendors were considered and
deliberately excluded — both categories are B2B-only products that a solo
individual can't meaningfully sign up for and plug their own personal data
into; they're vendor tools an org licenses, not consumer accounts a casual
checker creates. Covered the job-seeker side of that same gap instead with
**Teal** (a consumer-facing AI resume/career-planning tool), which fits the
stated ICP directly rather than stretching the B2B categories to fit.

## What I did NOT do

- No call to `POST /v1/check` or any other live API endpoint.
- No edits to `frontend/data/tools.json` or any backend code.
- No running of the actual extraction/review pipeline.
- No fabricated or guessed URLs — every entry above traces back to an actual
  WebSearch and/or WebFetch call; every failed-verification case (Perplexity
  Comet, Gamma, Teal, Kling AI) is flagged as such rather than presented with
  the same confidence as a directly-confirmed source.
