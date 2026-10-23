# Catalog batches (prepared, NOT submitted)

Each `batches/<id>/tools.json` is a fact-checked, approved batch: `domain`, `name`,
`source_url`, `badge` (intended verdict) and `summary` copied verbatim from the
fact-check. Publishing needs Elliot's credentials and is run by Jump, never by an agent.

| Batch | Tools | Fact-check |
|---|---|---|
| 2026-10-launch | DeepSeek, Lovable, Suno, Tabnine | deliverables/research/factcheck-batch-2026-10.md |
| 2026-10-23-A | Ahrefs, Mailchimp, Writesonic, Frase, Semrush, Pictory AI | deliverables/research/factcheck-batch-A-2026-10-23.md |
| 2026-10-23-B | HubSpot, Zapier, Mistral Vibe (formerly Le Chat), Character.AI, Kimi, Pika, Buffer, Poe | deliverables/research/factcheck-batch-A-holds-B-2026-10-23.md |
| 2026-10-23-C | Photoroom, Kling AI, Remove.bg, InVideo, n8n | deliverables/research/factcheck-batch-C-2026-10-23.md |

Held (not in any batch): Pi and Leonardo.Ai (policy pages return 403 to the pipeline; no usable archive copy),
NotebookLM (shared-domain rule: policy on support.google.com; no exception before launch), Canva, Descript, Grok,
Adobe Firefly, Meta AI, Gamma, Synthesia, CapCut, Loom, ManyChat, Murf AI, Surfer SEO, Notion (new row).
`scripts/tests/batches.test.mjs` FLAGS (fails, naming the reason) any batch row on a shared domain, with an
off-domain source, or on a known fetch-blocked domain.

## Prerequisite
This release branch is deployed (backend with `hold_for_review` + `manual_override`, migration
`backend/migrations/2026-10-15-add-manual-override.sql` applied remotely). `run-prod.sh submit` sends
`hold_for_review: true`, so every first-time domain lands in the review queue; nothing auto-publishes.

## Run order, per batch (all steps required; PolicyPeek reviews the preview before any --go)
1. `ANTHROPIC_API_KEY=... batches/runner/run-preview.sh batches/<id>` -> preview-result.json.
   It runs the real check pipeline locally against the live pages. AGREE = extracted verdict == intended badge; anything else = HOLD.
2. `batches/runner/run-prod.sh batches/<id> submit` (dry run), then `POLICYPEEK_API_KEY=... ... submit --go` (paid key). Only AGREE rows get sent.
3. Wait about 2 min, then `ADMIN_TOKEN=... run-prod.sh batches/<id> review` -> review-result.json (APPROVE / HOLD / LIVE_OK / LIVE_MISMATCH).
4. `ADMIN_TOKEN=... run-prod.sh batches/<id> approve --go`, then `review` again.
5. `run-prod.sh batches/<id> pin-sql` -> pin.sql (sets the summary and manual_override=1, atomic, asserts).
   `npx wrangler d1 time-travel info policypeek-db` (bookmark), then
   `npx wrangler d1 execute policypeek-db --remote --json --file=batches/<id>/pin.sql > batches/<id>/pin-output.json`.
6. HOLD rows: reject with `POST /v1/admin/pending/<id>/reject`, or leave them for a person. Then Jump refreshes and deploys the site.
