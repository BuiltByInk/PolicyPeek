# PolicyPeek

Checks whether a tool trains on your data, sourced from that tool's own published privacy policy, and shows it as a compliant / not compliant / unrated badge.

## Layout

- `backend/` — Cloudflare Workers API + D1. `wrangler dev --local` for local dev; deployment to real Cloudflare infra is intentionally not set up yet (no `wrangler login`, no real `database_id`, no secrets).
- `frontend/` — Astro static site. Reads `frontend/data/tools.json` at build time only; no live calls to the backend from the site itself.
- `.claude/agents/` — subagent role definitions (backend, frontend, security, research, docs). Not currently invokable as Task/Agent subagent types in this environment — treat as role descriptions to work from directly.

## Data model (`backend/schema.sql`)

- **tools** — the published, rated set. `compliance_status` is `not_compliant` / `compliant` / `unrated`. Two triggers keep `compliance_changelog` honest: one on `AFTER INSERT`, one on `AFTER UPDATE OF compliance_status`. Both are required — a prior build only had the UPDATE trigger, which silently skipped logging brand-new tools (the INSERT path).
- **pending_checks** — staging area between a submitted `/v1/check` and admin approval. `extracted_facts` holds facts only, never a verdict.
- **compliance_changelog** — audit trail. Approval writes an explicit row here *in addition to* whatever the DB trigger already wrote, on purpose (defense in depth against the trigger-not-firing class of bug above).
- **api_keys** — SHA-256 hash of the raw key, resolved to a `free`/`paid` tier per request. Missing/invalid key degrades to `free`, it doesn't error, except on `POST /v1/check` where a valid key is required outright (that endpoint costs money to run).

## The facts → verdict split (non-negotiable)

`backend/src/extraction.ts` calls Claude Haiku to pull **facts** out of raw policy text (`trains_on_user_data`, `data_retention`, `gdpr_mentioned`, `opt_out_available`, `relevant_clauses`). It is never allowed to produce a verdict — the output schema has no field for one.

`backend/src/rules.ts` is the one deterministic place a verdict gets assigned, from those facts:
- `unrated` — `trains_on_user_data` is `null` (genuinely unclear).
- `compliant` — `trains_on_user_data` is `false`, or it's `true` with `opt_out_available: true`.
- `not_compliant` — `trains_on_user_data` is `true` and opt-out isn't confirmed available.

The `true + opt_out_available: true → compliant` line was a gap-fill I made without an explicit sign-off — see `DECISIONS_NEEDED.md` if that's still open when you read this.

## Endpoints

- `GET /v1/lookup?domain=` — subdomain suffix-walk (most-specific match wins). Free tier gets badge + one-line reason; paid tier gets full evidence (retention, GDPR mention, source URLs, verified flag).
- `POST /v1/check` — body `{domain, source_url}`. Requires a valid API key. `source_url`'s hostname must equal `domain` or be a genuine subdomain of it (not just share a string suffix — see the domain-lock bug below). Fetches through `backend/src/ssrf.ts`'s SSRF-safe wrapper, stores the result, kicks off async fact extraction via `ctx.waitUntil`.
- `GET/POST /v1/admin/pending[...]` — list / approve / reject. Gated by `X-Admin-Token`, compared timing-safe (hash both sides, constant-time byte compare — never a plain `==`). Approving a domain that already has a `tools` row **updates it in place** instead of erroring; there's no dead-end 409 on re-submission.
- Cron (`*/15 * * * *`) — flags `pending_checks` stuck in `pending` past 30 minutes. Observability only, no auto-retry.

## Known-fixed security bugs (don't reintroduce these)

Both have regression tests in `backend/src/*.test.ts` (`npm test` in `backend/`):
1. **Domain-lock bypass** — `isSourceHostAllowedForDomain()` in `check.ts` requires an exact match or a real subdomain (dot boundary). A bare `hostname.endsWith(domain)` lets `"evil-acme.com"` pass for domain `"acme.com"`.
2. **SSRF IPv6 gap** — `isBlockedIpLiteral()` in `ssrf.ts` fully expands IPv6 (handles `::` shorthand, IPv4-mapped addresses in both hex-canonical and dotted-quad form, link-local, unique-local) before checking. A naive string-prefix check misses equivalent forms of the same address (`::1` vs `0:0:0:0:0:0:0:1`, `::ffff:127.0.0.1` vs `::ffff:7f00:1`).

## What's deliberately not done yet

- Not deployed anywhere. No real Cloudflare D1 database, no `wrangler login`, no secrets set.
- No `ANTHROPIC_API_KEY` configured on this machine — the Haiku extraction call has only been tested via its "key not configured" failure path, never a real call.
- `frontend/data/tools.json` is an empty array on purpose — no verdict ships without going through the real facts → rules → admin-review pipeline. Don't hand-populate it with guessed data.
