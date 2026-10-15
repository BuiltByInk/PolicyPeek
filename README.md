# PolicyPeek

PolicyPeek tells you whether an AI or SaaS tool trains on your data, using the tool's own published privacy policy. It shows one badge per tool: doesn't train on your data, trains by default (you can opt out), trains on your data with no opt-out, policy unclear, company-wide policy (shared domain), or not an AI tool. Badges describe what the published policy says; they are not legal advice or a finding about compliance with any law. It is a browser extension plus a website, backed by a small Cloudflare Workers API.

How a badge is made: an LLM step (Claude Haiku) extracts facts from the policy text and nothing else; a separate deterministic function (`backend/src/rules.ts`) turns those facts into the verdict. The model never emits a verdict. The full rule set is in `CLAUDE.md` and on the site's `/about` page.

This README is the map. Where things stand right now (what is live, what is built but not deployed) is in `changelog.md` and the current deploy runbook, not here.

## Repository layout

| Path | What is in it |
|---|---|
| `backend/` | Cloudflare Worker (TypeScript) and D1 schema: `src/` code and tests, `schema.sql`, `migrations/`, `wrangler.toml`. Public endpoints `GET /v1/lookup` and `POST /v1/check`, admin endpoints under `/v1/admin/`, cron jobs, SSRF-safe fetch wrapper. |
| `frontend/` | Astro static site (badge pages, tool list, methodology page, submit form). Builds from `frontend/data/tools.json`; it makes no API calls at build time. |
| `extension/` | Browser extension (Manifest V3, popup only, no background script): looks up the current tab's domain and lets the user submit a site that isn't in the catalog. |
| `scripts/` | Local helper scripts: `predeploy-check.mjs` (the gate before any deploy), `refresh-site.mjs` and `generate-tools-json.mjs` (pull the catalog from the live D1 into `tools.json`), `batch-submit.mjs`, `batch-outcomes.mjs`, `scrub-history.sh`. |
| `security/` | Security review reports and the local load-test harness (`security/loadtest/`). |
| `research/` | Tool sourcing (`tool_list.md`, `tool_sources.json`), audits, drafts (privacy policy, store listing), marketing research, and `research/manager/` (the manager's decision log and inbox). |
| `backups/` | Local safety copies (pre-change file snapshots; SQL dumps here are gitignored because they can contain client IPs). |
| `.claude/` | Agent definitions (`.claude/agents/`) and repo-level permission rules (`settings.json`). |
| `.github/workflows/ci.yml` | Minimal CI: runs `scripts/predeploy-check.mjs` on push and pull request. No secrets, no deploy. |

Docs at the root:

- `CLAUDE.md` - the operating charter: agent roles, the six verdict buckets, business model, permission and escalation rules. Start here.
- `changelog.md` - what shipped, by date, newest first.
- `DEPLOY_RUNBOOK_2026-09-19.md` - the ordered, checked deploy steps for everything built since the last deploy.
- `DECISIONS_NEEDED.md` - what is still open or waiting on Elliot. Settled entries are in `DECISIONS_ARCHIVE.md`.
- `ARCHITECTURE_NOTES.md` - how the system works: endpoints, tables, publish rules, cron jobs, data flow.
- `PROGRESS.md` - historical overnight log from August 2026; superseded by `changelog.md`.

## Run it locally

Backend (Cloudflare Worker with a local D1 database):

```bash
cd backend
npm install
cp .dev.vars.example .dev.vars    # then fill in ANTHROPIC_API_KEY and ADMIN_TOKEN; .dev.vars is gitignored
npm run db:migrate:local          # applies schema.sql to the local D1
npm run dev                       # wrangler dev
npm test                          # vitest
npx tsc --noEmit                  # type-check
```

Frontend:

```bash
cd frontend
npm install
npm run dev                       # astro dev
npm run build                     # static build into frontend/dist
```

The submit form on the site posts to `PUBLIC_API_BASE_URL`, which is set for production builds in `frontend/.env.production` and unset in a plain local build (the form then says submissions aren't switched on).

Extension: load `extension/` as an unpacked extension. `extension/config.js` points at the production API; to try it against a local `wrangler dev`, change `API_BASE_URL` there and add that origin to `host_permissions` in `manifest.json`.

Everything before a deploy in one command (backend tests and type-check, frontend build, `npm audit`, secret-looking strings, tracked env files, client IPs in tracked dumps):

```bash
node scripts/predeploy-check.mjs
```

## Deploys

Deploys are done by Elliot at his own computer, following the current `DEPLOY_RUNBOOK_*.md`. Agents never deploy: `wrangler deploy`, `wrangler pages deploy`, `wrangler secret`, remote D1 commands and force-pushes are denied in `.claude/settings.json`, and `CLAUDE.md` makes anything that touches live Cloudflare an ask-Elliot-first action. In outline:

1. Database migration first, if the runbook has one (`wrangler d1 execute --remote`).
2. Backend: `cd backend && npx wrangler deploy` (Worker at `api.getpolicypeek.com`).
3. Site: `node scripts/refresh-site.mjs --deploy` pulls the published catalog from D1, shows the diff, builds, verifies, and deploys to Cloudflare Pages only after its own confirmation. The site is static, so a newly published tool appears there only after this step; the API and extension show it immediately.
4. Extension: reload it unpacked, or submit a new version to a store by hand.
5. Dashboard-only settings (Cloudflare rate-limit rules, Anthropic spend limit) are listed in the runbook; they are not in the repo.

## Where to look next

- Verdict rules and agent roles: `CLAUDE.md`
- How the pieces fit: `ARCHITECTURE_NOTES.md`
- What is live and what changed: `changelog.md`
- Open questions: `DECISIONS_NEEDED.md`
- Security findings: `security/`
- Research, drafts and manager records: `research/`
