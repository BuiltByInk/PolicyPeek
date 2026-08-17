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
