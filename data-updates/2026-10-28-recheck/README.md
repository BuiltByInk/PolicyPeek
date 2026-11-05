# 2026-10-28 re-check data update (Perplexity, Mailchimp, Notion): PREPARED, NOT RUN

Needs **Elliot's own approval** before Jump runs it. Source: `deliverables/research/recheck-perplexity-mailchimp-notion-2026-10-28.md`; every quote was re-verified by PolicyPeek Dev on 28 Oct 2026 (snapshots in `research/qa-sources/2026-10-28/`).

| Domain | Change | Why |
|---|---|---|
| perplexity.ai | not_compliant → **compliant_with_caveats**, manual_override = 1 | Perplexity's help article "Data Collection at Perplexity": "For Free, Perplexity Pro and Perplexity Max users, AI Data Retention is enabled by default. However, these users can control whether their data is used for AI model training." and "Toggle off to opt out of AI training data collection". On by default; "Opt-outs only apply to data collected after the opt-out date". Source https://www.perplexity.ai/help-center/en/articles/11564572-data-collection-at-perplexity (403 to plain curl; text read from Perplexity's own Mintlify copy, 200). Manual entry because the pipeline gets 403. |
| mailchimp.com | **no change** (stays not_compliant, published) | Edited 4 Nov 2026 per Elliot: "Keep all 61 tools in PR #25, drop the audit's removals and re-check those 10". The earlier hold (row + changelog delete) was taken out of `apply.sql`. Re-check notes: `deliverables/dev/recheck-10-2026-11-04.md`. |
| notion.com | stays **compliant**; summary replaced, manual_override = 1 | Old quote "By default, Notion and its AI Subprocessors do not use Customer Data to train any models." is no longer on the page. Live: "By default, neither Notion nor our AI providers use your Customer Data to train any models." (https://www.notion.com/help/notion-ai-security-practices) |

Totals: 61 → 61 (caveats 20→21, not_compliant 14→13; others unchanged), asserted inside the batch. The before-guard now expects 61 rows (origin/main after batch E).

**Before deploying the regenerated site,** these published guides still describe Perplexity and/or Mailchimp as "no opt-out" and must be updated (or Mailchimp's links will 404): `does-mailchimp-use-your-data-for-ai-training`, `ai-tools-that-train-on-your-data-no-opt-out`, `ai-tools-that-dont-train-on-your-data-uk`, `how-to-check-if-an-app-trains-ai-on-your-data`.

Local proof (already run, `--local --persist-to <tmpdir>`, never remote): `bash data-updates/2026-10-28-recheck/tools/local_test.sh`
→ 59 rows seeded from origin/main tools.json; broken assert leaves DB unchanged; apply gives 58 rows, totals 20/14/12/7/4/1; rollback restores every tools row and Mailchimp's changelog exactly; re-apply after rollback works.

## Run order (Jump, from `backend/`, with Elliot's Cloudflare login and approval)
1. Restore point: `npx wrangler d1 time-travel info policypeek-db`. Record the bookmark.
2. Apply: `npx wrangler d1 execute policypeek-db --remote --json --file=../data-updates/2026-10-28-recheck/apply.sql > apply-output.json`. Any GUARD/ASSERT failure rolls the whole batch back.
3. Rollback, built now and kept: `node ../data-updates/2026-10-28-recheck/tools/gen_rollback.mjs apply-output.json > rollback-2026-10-28.sql`. Undo: `npx wrangler d1 execute policypeek-db --remote --file=rollback-2026-10-28.sql`. Last resort: `npx wrangler d1 time-travel restore policypeek-db --bookmark=<step 1>`.
4. If `queued_rechecks` lists ids, reject each via the admin endpoint (needs ADMIN_TOKEN).
5. `node scripts/refresh-site.mjs`; the result should match this branch's hand-mirrored tools.json except `updated_at`-style fields.
