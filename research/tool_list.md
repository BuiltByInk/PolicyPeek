# Seed tool list — 21 core AI/SaaS tools

Proposed by Research Agent, 2026-08-15. One line per tool: name, homepage URL.
Categories are informal groupings for this doc only — they aren't stored
anywhere in the schema.

## General chat assistants (4)

- ChatGPT — https://chatgpt.com
- Claude — https://claude.ai
- Gemini — https://gemini.google.com
- Microsoft Copilot — https://copilot.microsoft.com

## Search / answer assistant (1)

- Perplexity AI — https://www.perplexity.ai

## Coding / dev-infra tools (5)

- GitHub Copilot — https://github.com/features/copilot
- Cursor — https://cursor.com
- Windsurf (formerly Codeium) — https://windsurf.com
- Replit AI — https://replit.com/ai
- Sourcegraph Cody — https://sourcegraph.com/cody

## Image / video / audio generation (5)

- Midjourney — https://www.midjourney.com
- Stability AI (Stable Diffusion / DreamStudio) — https://stability.ai
- Adobe Firefly — https://www.adobe.com/products/firefly.html
- Runway — https://runwayml.com
- ElevenLabs — https://elevenlabs.io

## Writing assistants (3)

- Grammarly — https://www.grammarly.com
- Jasper — https://www.jasper.ai
- Copy.ai — https://www.copy.ai

## Productivity / AI-in-office (3)

- Notion AI — https://www.notion.so/product/ai
- Otter.ai — https://otter.ai
- Zoom AI Companion — https://www.zoom.com/en/ai-assistant/

---

Flagged for verification during sourcing (step 2), not excluded outright:
- **Windsurf / Codeium** — rebrand happened after my training cutoff (Jan
  2026); need to confirm current homepage/policy URLs still resolve under
  the new brand rather than assuming.
- **Sourcegraph Cody** — I have unconfirmed signal that Sourcegraph may have
  changed Cody's product status; verifying during sourcing rather than
  dropping it speculatively.

No tool on this list is regional-only as far as I know. If sourcing turns up
a dead product, defunct policy page, or no public privacy policy, it gets
logged to DECISIONS_NEEDED.md and dropped from the seed batch, not guessed.

---

# Second batch — 21 tools

Proposed by Research Agent, 2026-08-17. Same format: name, homepage URL.
Sourced to grow the catalog past the 19 currently published, favoring
single-product domains and categories a casual individual checker would
plausibly encounter (coding assistants, image/video/audio generation,
writing tools, AI search, voice/transcription, newer consumer-facing apps).

## Coding / dev-infra tools (5)

- Tabnine — https://www.tabnine.com
- Amazon Q Developer — https://aws.amazon.com/q/developer/
- JetBrains AI Assistant — https://www.jetbrains.com/ai/
- Bolt.new (by StackBlitz) — https://bolt.new
- v0 (Vercel) — https://v0.app

## Image / video / audio generation (5)

- Ideogram — https://ideogram.ai
- Luma AI (Dream Machine) — https://lumalabs.ai
- Suno — https://suno.com
- HeyGen — https://www.heygen.com
- Synthesia — https://www.synthesia.io

## Writing assistants (2)

- Wordtune — https://www.wordtune.com
- Sudowrite — https://sudowrite.com

## AI search (2)

- You.com — https://you.com
- Kagi — https://kagi.com

## Voice / transcription (3)

- Fireflies.ai — https://fireflies.ai
- Rev — https://www.rev.com
- Speechify — https://speechify.com

## Newer / casual consumer tools (4)

- Character.AI — https://character.ai
- Poe (Quora) — https://poe.com
- Granola — https://www.granola.ai
- DeepL — https://www.deepl.com

---

Skipped, not guessed — see `research/second_batch_summary.md` for detail:
- **Leonardo.Ai** — every fetch attempt (privacy-policy and terms-of-service
  paths, one retry each) returned HTTP 403. Domain-wide anti-bot block,
  same pattern as Windsurf/Adobe Firefly in the first batch.
- **Writer.com** — same domain-wide 403 pattern across two different
  legal-doc paths.
- **QuillBot** — same domain-wide 403 pattern across two different paths.
- **Krea AI** — no standalone privacy policy URL found on the real
  `krea.ai` domain. Search surfaced only unaffiliated mirror domains
  (`krea-ai.com`, `kreaai.app`, `kreaaiapk.com`) that explicitly disclaim
  being Krea AI — not used, flagged as a spoofed-domain risk rather than
  a simple gap.

Two tools worth a reviewer's attention despite being included (not dropped,
just not clean): **Character.AI**'s legal pages are a client-rendered SPA —
WebFetch confirmed the URLs resolve on the real domain but could not pull
full policy prose through the JS shell, same failure mode as Claude's nav-page
issue in the first batch. **Amazon Q Developer** lives on the shared
`aws.amazon.com` apex domain (many unrelated AWS products) — expect the
`shared_domain` heuristic to flag it, same as Gemini/Microsoft Copilot.

---

# Third batch — 17 tools

Proposed by Research Agent, 2026-08-18, per the weekly sourcing-pass cadence
in CLAUDE.md's "Growth Loop" section. Same format: name, homepage URL. Full
detail (URLs, verification notes, flags) in `research/tool_sources.json` and
`research/third_batch_summary.md`. This batch deliberately targeted gaps the
first two batches didn't cover: more coding assistants/agents, meeting/
note-taking tools, AI browsers, legal/finance-adjacent consumer AI, newer
image/video models, and two genuinely new categories (AI email, AI resume/
job-search) — while staying within the individual/casual-checker ICP (no
enterprise-only B2B infrastructure).

## Coding assistants / agents (4)

- Devin (Cognition) — https://devin.ai
- Warp — https://www.warp.dev
- Zed — https://zed.dev
- Continue.dev — https://www.continue.dev

## AI browser (1)

- Perplexity Comet — https://www.perplexity.ai/comet

## Meeting / note-taking (3)

- Fathom — https://www.fathom.ai
- Krisp — https://krisp.ai
- tl;dv — https://tldv.io

## Legal AI (1)

- DoNotPay — https://donotpay.com

## Presentation AI (1)

- Gamma — https://gamma.app

## Image / video generation, newer models (4)

- Recraft — https://www.recraft.ai
- Black Forest Labs (FLUX) — https://bfl.ai
- Pika — https://pika.art
- Kling AI — https://kling.ai

## Career / job-search AI (1)

- Teal — https://www.tealhq.com

## Research AI (1)

- Elicit — https://elicit.com

## AI email (1)

- Superhuman — https://superhuman.com

---

Skipped, not guessed:
- **Cleo AI** (personal-finance AI assistant) — both `meetcleo.com/page/
  privacy-policy` and `cleoapps.com/privacy` returned HTTP 403 on every
  attempt (one retry each). Same domain-wide anti-bot pattern as Leonardo.Ai/
  Writer.com/QuillBot in the second batch. `meetcleo.com` confirmed as the
  real primary domain; `hicleo.com`/`cleoapps.com`'s exact relationship to it
  was not resolved either way, so neither was substituted in as a source.
- **Sora (OpenAI)** — considered, not included: it uses OpenAI's main
  privacy policy/terms, the same document already sourced for the existing
  `chatgpt` catalog entry, not a materially distinct product-specific legal
  document, so adding it would just duplicate an existing source rather than
  add new catalog coverage. Also worth flagging: search surfaced
  `sorabyopenai.com`, which is **not** OpenAI's domain (a direct-fetch
  attempt returned a connection error consistent with an unaffiliated/
  low-quality site) — not used anywhere as a source.

Categories deliberately not sourced this batch, per the ICP boundary in
CLAUDE.md ("consumer-or-prosumer-facing... not enterprise-only B2B
infrastructure nobody signs up for solo"): dedicated **customer-support AI**
(Intercom Fin, Zendesk AI, Ada) and **HR/recruiting AI** (Workday AI,
Greenhouse AI) vendors are both B2B-only products a solo individual can't
meaningfully sign up for and plug their own data into. Covered the
job-seeker side of that gap instead with **Teal** (a consumer-facing AI
resume/career tool), which fits the ICP directly.

Flags for reviewer attention — see `research/third_batch_summary.md` for
full detail:
- **Devin (Cognition)** — one-product/company-two-domains, but sharper than
  Bolt.new/StackBlitz: Cognition's single privacy policy covers both Devin
  (`devin.ai`) and Windsurf (`windsurf.com`, already in the catalog) by
  name, and the product domain (`devin.ai`) differs from the legal-doc
  domain (`cognition.ai`/`cognition.com`).
- **Perplexity Comet** — shares the `perplexity.ai` apex domain with the
  already-catalogued Perplexity AI entry; expect `shared_domain` to fire
  even though this is a same-vendor multi-product case, not an unrelated-
  products-on-one-domain case like AWS/Vercel.
- **Pika** — client-rendered SPA privacy policy; WebFetch only got an
  accordion table-of-contents, never the clause text, on two attempts. Same
  failure mode as Character.AI in the second batch.
- **Gamma** — tier-split training-use policy (Free trains by default,
  Team/Business/Enterprise doesn't), same pattern as DeepL/GitHub Copilot.
  Also: direct WebFetch verification failed (403 x2); sourced via WebSearch
  summary only.
- **Recraft** — a different flavor of tier split than DeepL's: Free-tier
  generated images are public/Recraft-owned, paid-tier images are private/
  user-owned. Model-training use itself has a settings-level opt-out
  regardless of tier.
- **Teal** — direct WebFetch verification failed (403 x2); sourced via
  WebSearch summary only, and that summary found no explicit statement on
  whether resume/career content trains Teal's AI features either way.
- **Kling AI** — lowest-confidence entry in this batch. Every direct
  WebFetch attempt (privacy and terms) returned HTTP 446, an unusual status
  code; everything sourced here is from WebSearch's summary of the live
  pages, not an independently confirmed raw fetch. China-based parent
  (Kuaishou) also raises international-transfer questions worth a
  reviewer's attention beyond what this pass could confirm.
- **Continue.dev** — a search-result label ("Continue (acquired by
  Cursor)") suggests a possible recent acquisition by Anysphere/Cursor
  (already a separate catalog entry), not confirmed inside Continue's own
  privacy policy/terms or independently verified elsewhere. If true, this
  would eventually mirror the Devin/Windsurf/Cognition shape: two
  differently-branded, differently-domained products under one owner.
