# Security review — 2026-09-17 ("Reviewed by a human" field fix)

Scope: everything touched by this fix — exposing `tools.auto_published`
through to the frontend and switching `[domain].astro`'s "Reviewed by a
human" field to read it instead of `verified`. Targeted diff review
(`review-2026-09-06.md` pattern), not the concurrency load-test harness —
no D1 write path, endpoint, or auth code changed at all this pass.

## What actually changed

- `frontend/src/types.ts` — added `auto_published: boolean` to the `Tool`
  type, plus a doc comment on `verified` warning against reusing it for
  this purpose again.
- `scripts/generate-tools-json.mjs` — added `auto_published` to the
  `SELECT` column list and the output mapping. No other column touched.
- `frontend/data/tools.json` — regenerated; diffed against the prior file
  before committing — confirmed the *only* change is one new
  `"auto_published": true/false` field per row, nothing else moved.
- `frontend/src/pages/tools/[domain].astro` — the displayed field now
  reads `tool.auto_published` (inverted), not `tool.verified`.
- **No backend code changed.** `admin.ts`'s write paths for
  `auto_published` were already correct on both the human-approval and
  auto-publish paths (checked directly — see `DECISIONS_NEEDED.md` for
  the full trace). No migration needed — the column already existed.

## Checks

- **Auth / endpoints**: untouched, no endpoint code in this diff.
- **SSRF**: untouched.
- **Admin token comparison**: untouched.
- **XSS**: `auto_published` is a boolean sourced from D1, written only by
  trusted backend code (`admin.ts`'s hardcoded/parameterized values, never
  raw LLM-extracted or user-submitted text) — no injection surface, and
  Astro escapes template output by default regardless.
- **Concurrency**: no write path touched, nothing to re-validate against
  the existing harness.
- **Schema**: no migration in this pass — `auto_published` already existed
  in `schema.sql` (`INTEGER NOT NULL DEFAULT 0 CHECK (auto_published IN
  (0, 1))`) and was already committed.
- **Data accuracy** (the actual point of this change): cross-checked the
  live value of `auto_published` for all 32 currently-published tools
  against this project's own `changelog.md`/`DECISIONS_NEEDED.md` history
  (which mechanism approved each one, and when) — every row matches the
  documented history. No backfill was needed; the column was already
  populated correctly by the existing write paths for every row that
  exists today. Full per-tool cross-check in `DECISIONS_NEEDED.md`.

## Findings

None. 0 High / Medium / Low. This is a narrow, read-path-only display fix
with no new write surface, no new user input, and no auth/SSRF-adjacent
code touched.
