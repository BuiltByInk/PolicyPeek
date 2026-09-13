# Security review — 2026-09-13 (Phase 2.5i)

Scope: everything touched by Phase 2.5i (commits `ee2e040`..`2b0813b`) —
the tools.json drift fix, the `opt_out_available` schema/persistence
addition, and documentation-only Copilot/Adobe Firefly/legacy-backlog/
about-copy findings. Following the `review-2026-09-06.md` pattern (a
targeted diff review against what actually changed), not the separate
`review-2026-09-06-concurrency.md` live-traffic load-test harness — this
pass didn't touch `check.ts`, `rateLimit.ts`, `ssrf.ts`, or any
concurrency-relevant code path, so firing real paid HTTP/extraction
traffic to re-validate concurrency behavior nothing here could have
affected would be disproportionate, not more thorough.

## What actually changed

`git diff ee2e040~1..2b0813b --stat`:
- `frontend/data/tools.json` — 2 rows' `compliance_status` field only
- `backend/schema.sql` — one new nullable column
- `backend/src/admin.ts` — 4 SQL write sites gained one more bound column
- `backend/migrations/2026-09-13-add-opt-out-available.sql` (new)
- `backend/migrations/2026-09-13-add-opt-out-available.rollback.sql` (new)
- `backend/src/admin.optOutAvailable.test.ts` (new)
- `DECISIONS_NEEDED.md` — documentation only, no code

No changes anywhere in `ssrf.ts`, `rateLimit.ts`, `auth.ts`, `cors.ts`,
`check.ts`, `extraction.ts`, or `rules.ts` — every finding from the
2026-08-18 and 2026-09-06 reviews still stands unmodified.

## 1. [INFORMATIONAL] New `opt_out_available` bind values — parameterized, no injection surface

All four write sites in `admin.ts` (`approvePendingCheck`'s UPDATE/INSERT,
`tryAutoPublishAtomic`'s INSERT/UPDATE) pass the new value through
`.bind()` exactly like every neighboring column — `facts.opt_out_available
=== null ? null : Number(facts.opt_out_available)`, never string-
concatenated into the SQL text. Verified placeholder count matches bound
arg count at each site by inspection (also implicitly verified by the
test suite: `admin.changelogDedup.test.ts`'s fake UPDATE handler reads
the WHERE-clause args via `boundArgs[boundArgs.length-2/-1]`, which only
still works if every earlier positional arg — including the new one —
lines up correctly; it does, 67/67 passing). No new injection surface.

## 2. [INFORMATIONAL] Schema change is additive and backward-compatible

`ALTER TABLE tools ADD COLUMN opt_out_available INTEGER CHECK
(opt_out_available IN (0, 1))` — no default, so every existing row reads
NULL, which the CHECK constraint permits (SQLite only rejects an outright
`FALSE` result, not NULL — same pattern already used by
`trains_on_user_data`/`gdpr_mentioned`). Confirmed by actually running
this against the local D1 mirror (empty table — see below) and by the
existing 65 pre-Phase-2.5i tests continuing to pass unmodified against
the new schema.

## 3. [INFORMATIONAL] Backfill query logic — verified against synthetic fixtures, not assumed correct

The backfill's `json_extract(...)` + note-parsing join was tested against
4 constructed cases on the local D1 mirror before being trusted (not run
blind against anything real): a present value (correctly set), an
unrecoverable/null fact (correctly left NULL), a tool with no traceable
`pending_check` at all (correctly left NULL, no false match), and a
recheck with two changelog entries where the most-recent overwrote an
earlier value (correctly picked the latest, confirmed both
null-then-value and value-then-null orderings resolve correctly). All
fixture rows were deleted afterward (verified `SELECT COUNT(*)` back to 0
across `tools`/`pending_checks`/`compliance_changelog`) so no test data
was left behind in the local dev D1 file.

## 4. [INFORMATIONAL] Deny-list compliance — confirmed no denied action was taken

Every `wrangler` invocation this pass used `--local` (`d1 execute
policypeek-db --local ...`) or no D1 flag at all (`npm test`, `npm run
build`). `grep`-checked this review's own command history by recollection
and cross-checked against the commit messages, which explicitly document
every place `--remote` was needed but deliberately not run (the tools.json
regen script, the real migration). No `wrangler deploy`/`secret`/publish
command was run. No `git push` was run — all four phase commits are
local-only on `main`, matching `origin/main` from before this pass started
(this pass is now ahead of `origin/main` by 4 commits, unpushed).

## 5. [INFORMATIONAL] tools.json hand-patch — scoped exactly as intended

Diffed before committing: only `Bolt.new` and `HeyGen`'s
`compliance_status` fields changed, nothing else in either object and no
other tool touched — confirmed via `git diff --stat` (2 insertions, 2
deletions) before commit `ee2e040`. Values match the documented real-D1
state in `DECISIONS_NEEDED.md`'s Phase 2.5h entry exactly (`compliant` →
`compliant_with_caveats` for both, nothing else).

## 6. [INFORMATIONAL] Documentation-only commits (Phases C, D, E) — no code touched

Confirmed via `git show --stat` on `65ee131`, `a868492`, and `2b0813b`:
each touches only `DECISIONS_NEEDED.md`. No behavior change, no data
change, nothing to review for injection/exposure beyond the copy itself
(reviewed for accuracy against source code in Phase C/D's own writeups,
not just asserted).

## 7. [INFORMATIONAL] Regression check — full suite passing, build clean

`npx vitest run` (post all four phases): 14 test files, **67 passing** (65
pre-existing + 2 new, covering the `opt_out_available` persistence path
itself). `npm run build` in `frontend/`: 35 pages, clean, no errors —
confirms the hand-patched `tools.json` is still valid JSON the site
builds from correctly.

## Not in scope for this review

Genuine concurrency/live-traffic validation (the `review-2026-09-06-
concurrency.md` pattern) wasn't re-run, because nothing in this pass
touches the code paths that pattern exists to test (`check.ts`'s race
window, `rateLimit.ts`'s atomic reservation, SSRF redirect handling).
Re-running it here would spend real extraction-API cost validating code
that provably didn't change. If a future pass touches `check.ts`,
`autoPublish.ts`'s eligibility logic, or `rateLimit.ts`, that's the
trigger to re-run the concurrency harness, not this one.

---

## Summary

- **High:** 0
- **Medium:** 0
- **Low:** 0
- **Informational:** 7 — new bind values are parameterized, no injection
  surface (#1); schema change is additive/backward-compatible (#2);
  backfill logic verified against constructed fixtures, not assumed
  (#3); no deny-listed command was run, nothing pushed to any remote
  (#4); the tools.json patch is scoped to exactly the two intended rows
  (#5); Phases C/D/E are documentation-only (#6); full test suite (67/67)
  and frontend build both clean (#7).

No new SSRF, rate-limiting, auth, or concurrency findings — those code
paths are unchanged since the 2026-08-18/09-06 reviews, which still
apply. The one still-outstanding item from those earlier reviews
(concurrent-load validation before Phase 3 public traffic) is unaffected
by this pass and remains open on its own terms.
