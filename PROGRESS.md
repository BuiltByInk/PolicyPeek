> **HISTORICAL. Superseded by `changelog.md`.** This is the overnight log from 2026-08-05/06, kept as it was written. It is not a current status page: the items listed under "In `DECISIONS_NEEDED.md` (needs you)" below have since been resolved (see `DECISIONS_ARCHIVE.md`), and the commit hashes and the "not pushed" note describe that night only. For what has shipped, read `changelog.md`; for what is open, `DECISIONS_NEEDED.md`; for how things work, `README.md` and `ARCHITECTURE_NOTES.md`.

---

# Overnight progress — 2026-08-05/06

Worked the task list top to bottom while you were offline. Everything below is committed locally on `main` (5 commits, `4502505`..`5e5471c`) but **not pushed** — `git push` is hard-denied by the settings.json we set up together tonight, and there's no one to approve past a deny rule. Push it yourself, or loosen that rule, when you're back.

## Done

**Frontend**
- Built `/tools` (listing, badge + one-line reason per tool, handles the zero-tools state) and dynamic `/tools/[domain]` detail pages — neither existed before tonight.
- Shared `Layout.astro`: responsive nav/footer, per-page meta description, OpenGraph + Twitter tags.
- `/about`: methodology page — the facts → deterministic rule → human review pipeline, and why "unrated" means "we don't know," not "probably fine."
- SEO: `@astrojs/sitemap` wired up, `robots.txt` added. Uses a placeholder domain (see Decisions).
- Verified all of it with a temporary local-only fixture (two fake tools, one `not_compliant` one `unrated`) — checked the actual generated HTML for correct badge colors, escaped text, and the amber/red prominent-reason styling, then restored the real empty `tools.json` before committing. No fabricated data shipped.

**Research**
- Couldn't find the "21 preloaded AI tools" list, any extension code, or `memory/CLAUDE.md` anywhere in the repo — flagged as blocked rather than guessing tool names or URLs. See Decisions.
- Competitive scan done (ToS;DR, Termzy AI, TrustScan) — FYI section in `DECISIONS_NEEDED.md`, not acted on.

**Backend**
- Added vitest + regression tests for both security fixes from earlier tonight (domain-lock bypass, SSRF IPv6 gap). Writing the SSRF test caught a real remaining hole: `isBlockedIpLiteral` only handled `::ffff:127.0.0.1`-style addresses once a URL parser had already canonicalized them to hex form — the raw dotted-quad form slipped through. Fixed it for real this time, all 11 tests pass.
- Reviewed `rules.ts` against schema + your original spec (no `memory/CLAUDE.md` to check against — see Decisions). Found one gap-fill I made silently at milestone 6; flagged it, didn't touch the logic.
- Didn't touch `wrangler.toml`'s `database_id`, didn't run `wrangler login`/`deploy`, didn't reference the admin token anywhere new.

**Docs**
- Created root `CLAUDE.md` (architecture, schema, the facts/verdict split, known-fixed bugs, what's deliberately not done). Synced `README.md`.
- Checked `.claude/agents/*.md` for bugs described as still-open that got fixed tonight — both mentions (changelog trigger, 409/resubmission) are already phrased as historical context, not as open issues, so nothing needed changing there. No `.claude/skills/` directory exists yet.

## In `DECISIONS_NEEDED.md` (needs you)

1. Missing 21-tool list / extension code / `memory/CLAUDE.md` — blocking the main research task.
2. `rules.ts`'s silent gap-fill (trains-by-default-with-opt-out → currently counted as compliant) — your call, not mine.
3. Placeholder production domain in `astro.config.mjs` / `robots.txt` — needs the real one before deploy.
4. FYI only: competitive scan, not urgent.

## Not started (wasn't on the list, didn't touch)

Nothing — the full list is above. Didn't invent anything extra.
