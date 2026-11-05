# 2026-11-04 Runway re-check data update: PREPARED, NOT RUN

Needs **Elliot's own approval** before Jump runs it. Brings D1 in line with `frontend/data/tools.json` on `feat/qa-pages` (commit f92634e).

| Domain | Change | Source |
|---|---|---|
| runway.com | unrated → **not_compliant**, trains_on_user_data = 1, opt_out_available = 0, manual_override = 1, auto_published = 0, last_checked_at 2026-11-04T00:00:00.000Z | https://runway.com/terms-of-use ("Last updated October 23, 2026"): "You acknowledge that Inputs and Outputs may be used by the Company to train and improve its AI models, algorithms and related technology, products and services (including for labeling, classification, content moderation and model training purposes)." The only opt-out in the terms is from arbitration (16.9). Re-check: `deliverables/dev/recheck-10-2026-11-04.md`; PolicyPeek fact-check approved not_compliant (`deliverables/research/recheck-10-2026-11-04.md`). |

The changelog row (unrated → not_compliant) is written by `trg_tools_changelog_on_update`, as in earlier packages; there's no manual insert.

**Totals:** guarded before = 21/15/13/7/4/1 (61); asserted after = **21/15/14/6/4/1 (61)** (caveats/compliant/not_compliant/unrated/shared/not_ai_tool).

## Run order on D1 (each guards its starting state; any failure rolls back the whole file)
1. `2026-10-24-copilot-otter`, only if it was never run (it isn't recorded as applied)
2. `2026-10-28-recheck` (Perplexity → caveats, Notion quote; Mailchimp kept)
3. `2026-10-28-audit` (quote/source fixes; since 4 Nov it removes nothing)
4. **this package**

(`2026-11-04-batch-e` is already applied on D1.) Run out of order, the totals guard stops it with nothing changed.

## Commands (Jump, from `backend/`, with Elliot's Cloudflare login and approval)
1. `npx wrangler d1 time-travel info policypeek-db`. Record the bookmark.
2. `npx wrangler d1 execute policypeek-db --remote --json --file=../data-updates/2026-11-04-runway/apply.sql > runway-apply-output.json`
3. `node ../data-updates/2026-11-04-runway/tools/gen_rollback.mjs runway-apply-output.json > rollback-2026-11-04-runway.sql`. Keep it. To undo, run it with `--file=`. It restores the row column by column and removes the trigger's changelog row.
4. `node scripts/refresh-site.mjs`. The output should match this branch's tools.json.

## Local proof (never remote)
`bash data-updates/2026-11-04-runway/tools/local_test.sh` seeds origin/main's 61 tools into a temp local D1, checks that running out of order is refused, runs recheck → audit, then checks the following:
- a broken assert changes nothing
- apply makes all 61 rows match tools.json and adds 1 changelog row
- rollback restores the tools and changelog exactly
- re-apply works
