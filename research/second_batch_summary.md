# Second batch — 21 tools sourced, 2026-08-17

Research Agent pass, run at Elliot's explicit go-ahead to grow the catalog
past the 19 currently published (out of 21 researched in the first batch).
Same rigor as the first batch: every URL below was found via WebSearch and
then verified with a direct WebFetch — confirming the page actually loads
and is genuinely that vendor's policy/terms/security content, not pattern-
matched from a guessed path. Nothing here has been submitted through the
real pipeline (`POST /v1/check`) or touched `data/tools.json` — this is
sourcing only, same scope boundary as the first batch and as CLAUDE.md's
org chart specifies for this role.

**21 tools sourced, across 6 categories.** Full list with URLs in
`research/tool_list.md`'s "Second batch" section; full per-tool
privacy/ToS/DPA/trust-page URLs plus verification notes in
`research/tool_sources.json`.

## Read these three things before running this batch through extraction

**1. Two tools are on shared apex domains — expect `shared_domain` flags.**
Same situation as Gemini/Microsoft Copilot in the first batch, same fix
already wired in (`sharedDomains.ts`'s curated list + auto-flag at
submission time per `DECISIONS_NEEDED.md`):
- **Amazon Q Developer** — sourced from `aws.amazon.com`, which covers
  every AWS service, not just Q Developer. Used AWS's general Privacy
  Notice and Service Terms since no Q-Developer-specific legal doc exists;
  the AWS docs data-protection page is the closest thing to a scoped
  source and is what's in the `security_trust_page` slot.
- **v0** — its privacy policy, ToS, and DPA all live on `vercel.com`
  (Vercel's whole hosting platform), not `v0.app`. Used `v0.app/policy`
  as the security_trust_page slot since it's the one genuinely v0-scoped
  legal document and states the actual compliance-relevant fact (tiered
  model-training opt-in/opt-out).

**2. Character.AI's legal pages are a client-rendered SPA.** Both URLs
(`character.ai/privacy`, `character.ai/tos`) are confirmed genuine — they
resolve on the real domain via the canonical `policies.character.ai`
redirect Character.AI itself publishes, not a guess or a lookalike. But
WebFetch only ever received the page shell/tagline, never the policy
prose, on every attempt. This is the same underlying failure mode as
Claude's nav-page problem in the first batch (`htmlClean.ts`'s
truncation-before-cleaning bug), except here it's a JS-rendering gap, not
a wrong source URL — worth checking whether the backend's own fetcher
executes JS before assuming this one will extract cleanly. Also worth
knowing: search surfaced a lookalike domain, `characterai.cc`, claiming
to host Character.AI's terms. It is not Character.AI's domain (an nginx
403 error page, no real branding) — checked and explicitly not used
anywhere in `tool_sources.json`. Flagging in case anyone else researching
this tool later hits the same search result.

**3. Two tools have compliance answers that genuinely depend on which
tier the user is on**, same pattern as GitHub Copilot/Grammarly in the
first batch — not an extraction gap, a real fact split:
- **DeepL**: free-tier submissions are used to train DeepL's models
  (temporary retention, confirmed directly in both the privacy policy and
  free-service Terms of Use); Pro/paid submissions explicitly are not.
- **Suno**: free vs. paid tiers get different output-ownership terms, on
  top of the broad perpetual training-use license that applies to
  everyone's submissions regardless of tier.

## Notable individual flags (not blockers, just worth a reviewer's eye)

- **Sudowrite**'s privacy policy is dated October 6, 2020 and never
  mentions AI, model training, or any generative feature — for a company
  whose entire product is AI fiction-writing, this reads like a stale
  template nobody updated. Confirmed genuine, not fabricated or swapped
  for something newer. Expect extraction to come back with null
  training-related facts — that's an honest reflection of a thin source,
  not a pipeline bug to chase.
- **JetBrains AI Assistant**'s DPA (`jetbrains.com/legal/dpa/`) is
  versioned 1.3, dated April 2022 — older than the AI-specific ToS it's
  linked from (2025). The AI ToS itself is otherwise the cleanest
  no-default-training language in this batch: inputs/outputs won't train
  models "without express permission."
- **Ideogram** and **Luma AI** both confirm user data trains their models
  with no clear opt-out beyond marketing-email preferences — genuinely
  weaker postures than most of this batch, not an extraction miss.
- **Kagi** has no separate Terms of Service URL distinct from its privacy
  page (`kagi.com/privacy` covers both, per Kagi's own site structure) —
  used the same URL for both fields rather than invent a `/terms` path
  that doesn't resolve. Confirmed via search that `kagi.io` is an
  unrelated third-party service (Zenidev) and was not mistaken for Kagi
  Search anywhere in this record.

## Skipped — 4 tools, not guessed

- **Leonardo.Ai** — both `leonardo.ai/privacy-policy` and
  `leonardo.ai/terms-of-service` returned HTTP 403 on every attempt (one
  retry each, per the one-retry budget). Domain-wide, not path-specific —
  same anti-bot pattern already documented for Windsurf and Adobe Firefly
  in `DECISIONS_NEEDED.md`. Worth adding to that doc's list if/when
  someone builds the Wayback-snapshot fallback mentioned there.
- **Writer.com** — same domain-wide 403 pattern, confirmed across two
  different legal-doc paths (`/legal/privacy/` and `/trust/`).
- **QuillBot** — same domain-wide 403 pattern, confirmed across two
  different paths (`/privacy` and `/trust-center`).
- **Krea AI** — no standalone privacy policy exists on the real `krea.ai`
  domain as far as search surfaced (only an Acceptable Use Policy and a
  security/trust page, neither of which is a privacy policy). Search
  results were dominated by unaffiliated mirror domains (`krea-ai.com`,
  `kreaai.app`, `kreaaiapk.com`) that explicitly disclaim being Krea AI in
  their own text — not used. Flagging this as a spoofed-domain risk
  pattern worth remembering for future sourcing passes, not just a
  missing-page gap: a less careful pass could have sourced a fake
  "Krea AI privacy policy" from one of those domains and never noticed.

Replaced Leonardo.Ai and Krea AI within the image/video/audio category
using tools that verified cleanly (Ideogram, Luma AI, Suno, HeyGen,
Synthesia) rather than padding the batch with unverifiable entries just to
hit a target count.

## What I did NOT do

- No call to `POST /v1/check` or any other live API endpoint.
- No edits to `frontend/data/tools.json` or any backend code.
- No running of the actual extraction/review pipeline — that requires a
  live backend, out of scope for this role per CLAUDE.md.
