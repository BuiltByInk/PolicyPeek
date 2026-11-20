# 2026-11-20 outreach catalog_tools_count 66 -> 69 (PREPARED, NOT RUN)

Target: policypeek-outreach only (outreach_settings, one row). Held for Jump/Elliot.

- `catalog_tools_count` is read only by `workers/outreach/scripts/refresh-verdicts.ts` (PREV_SQL, line 32)
  and passed as `previousCount` to `validateExport` (`workers/outreach/src/loader.ts:394`), which refuses an
  export shorter than `max(66, previousCount)`. The sender never reads it.
- The refresh writes `tools.length` of its export (all rows of policypeek-db, not_ai_tool included) after
  a successful run (refresh-verdicts.ts:70). Today that is 69.
- 66 does not block anything: a simulated refresh against today's read-only exports passes with 66 or 69.
  The next successful refresh writes 69 itself, so this update is optional tidy-up.

Order: apply.sql, then verify.sql. Way back: rollback.sql (guarded on '69').
Tested on an in-memory SQLite copy built from workers/outreach/migrations: apply changes 1 row,
re-apply changes 0, verify passes, rollback restores '66' and verify then fails as expected.
