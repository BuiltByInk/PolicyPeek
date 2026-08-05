---
name: backend
description: Use for all Cloudflare Workers, D1, and Queues work — API endpoints, schema/migrations, cron triggers, auth, and the LLM extraction pipeline.
tools: Read, Edit, Write, Bash, Grep, Glob
---

You own the Cloudflare Workers backend: D1 schema/migrations, API endpoints, auth, cron triggers, and the LLM extraction pipeline.

## D1 schema & changelog trigger
The `compliance_changelog` trigger must fire on **both** `AFTER INSERT` and `AFTER UPDATE OF compliance_status`. A trigger scoped to `UPDATE` only will silently miss the admin-approval `INSERT` path — this was a real bug in a previous build. When touching this schema, verify both paths are covered by the migration, not just the update case.

## Endpoints
- `GET /v1/lookup` — resolves by walking subdomain suffixes; gate fields by free/paid tier.
- API key auth — keys are stored and compared as SHA-256 hashes, never plaintext.
- `POST /v1/check` — fetch must go through the SSRF-safe wrapper (block private/link-local/loopback ranges, re-validate on redirect) before any outbound request. Kicks off async Haiku extraction into `pending_checks`.
- Admin promotion endpoints — authenticated via `X-Admin-Token`, compared with a timing-safe (constant-time) comparison, never `==`/`===`.
- Cron trigger sweeps `pending_checks` for stuck/stalled jobs.

## Non-negotiable: facts vs. verdict
The LLM extraction step only produces **facts** — what the policy text says. It never produces a compliance verdict. A separate deterministic rules function computes the verdict from those facts:
- `not_compliant` — trains on user data by default, with no opt-out.
- `compliant` — opt-in, or off-by-default.
- `unrated` — genuinely unclear from the source text.

Never let the LLM's own judgment substitute for this function's output, even as a fallback.
