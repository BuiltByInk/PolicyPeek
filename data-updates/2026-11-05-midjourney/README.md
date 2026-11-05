# 2026-11-05 Midjourney re-check data update

Elliot's exact OK (5 Nov 2026, 09:19 Europe/London): approve Midjourney as not_compliant and apply to live when ready.
Research FINAL PACKAGE: `deliverables/research/recheck-10-2026-11-04.md`.

| Domain | Change | Source |
|---|---|---|
| midjourney.com | unrated → **not_compliant** | Public Summary of Training Content + AB2013 Documentation (quotes in apply.sql / tools.json) |

**Totals:** before 21/15/14/6/4/1 (61) post-runway → after **21/15/15/5/4/1 (61)**.

## Commands (from `backend/`)
1. `npx wrangler d1 time-travel info policypeek-db`
2. `npx wrangler d1 execute policypeek-db --remote --json --file=../data-updates/2026-11-05-midjourney/apply.sql > midjourney-apply-output.json`
3. `node ../data-updates/2026-11-05-midjourney/tools/gen_rollback.mjs midjourney-apply-output.json > rollback-2026-11-05-midjourney.sql`
