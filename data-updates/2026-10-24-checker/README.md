# 2026-10-24 checker data update: PREPARED, NOT RUN

Follows deliverables/data-update-2026-10. Two rows, both pinned with `manual_override = 1`:

| Domain | Change | Why |
|---|---|---|
| zapier.com | INSERT, compliant_with_caveats | Elliot's manual override (Research verdict). The checker reads the page as contradictory (enterprise auto-opted-out vs everyone else "may opt out") and returns unrated, so the pin is needed to keep recheck from changing it. |
| perplexity.ai | unrated → not_compliant | Accepted checker change: "Improve or create services and products, including our AI models"; only ad-targeting opt-outs. |

**Not included, on purpose:** elevenlabs.io, heygen.com, kimi.com, mistral.ai and photoroom.com stay compliant_with_caveats. Their "downgrade" came from a bug in the first version of the opt-out post-check, and the fixed checker agrees with the published verdict, so no pin is needed. jetbrains.com stays compliant_with_caveats: the checker only reads its first source (paid-plan Terms) and misses the free-tier default-on training in the second source. It is already manual_override from the 2026-10 update, so recheck won't change it. Evidence: deliverables/research/checker-dryrun-2026-10-24.md.

Files: `apply.sql` (snapshot, guards, INSERT + pinned UPDATE, verification, asserts), `tools/gen_rollback.mjs` (rollback from the live snapshot; also deletes the inserted Zapier row and its trigger-written changelog row), `tools/gen_seed.py` + `tools/local_test.sh` (local-only proof).

Local proof (already run, `--local --persist-to <tmpdir>`, never remote): `bash data-updates/2026-10-24-checker/tools/local_test.sh`
→ 43 rows seeded from tools.json; broken assert leaves DB unchanged; apply gives 44 rows, totals 16/11/7/5/4/1; rollback restores all rows exactly; re-apply after rollback works.

## Run order (Jump, from `backend/`, with Elliot's Cloudflare login and approval)
Prereq: migrations/2026-10-15-add-manual-override.sql is already applied (it was part of the 2026-10 update).

1. Restore point: `npx wrangler d1 time-travel info policypeek-db`. Record the bookmark.
2. Apply (saves the before-snapshot):
   `npx wrangler d1 execute policypeek-db --remote --json --file=../data-updates/2026-10-24-checker/apply.sql > apply-output.json`
   Any GUARD/ASSERT failure (a "malformed JSON" error) rolls the whole batch back. If the totals assert fails, live D1 differs from tools.json: stop and re-check.
3. Build the rollback now and keep it:
   `node ../data-updates/2026-10-24-checker/tools/gen_rollback.mjs apply-output.json > rollback-2026-10-24.sql`
   Undo: `npx wrangler d1 execute policypeek-db --remote --file=rollback-2026-10-24.sql`
   Last resort: `npx wrangler d1 time-travel restore policypeek-db --bookmark=<step 1>` (reverts the WHOLE DB).
4. If `queued_rechecks` in apply-output.json lists ids, reject each (needs ADMIN_TOKEN):
   `curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" https://api.getpolicypeek.com/v1/admin/pending/<id>/reject`
5. Site data: `node scripts/refresh-site.mjs` (pulls from D1 into frontend/data/tools.json, diff + confirm + build), then deploy per the usual process. tools.json is NOT hand-edited in this branch, because refresh-site regenerates it from D1.
6. Deploy the backend from fix/checker-extraction (new extraction code) only after Elliot approves.
