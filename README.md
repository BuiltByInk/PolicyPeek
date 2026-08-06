# PolicyPeek

Looks up whether a tool/domain's privacy policy allows training on user data, surfaced as a green/amber/red badge.

## Layout
- `backend/` — Cloudflare Workers API + D1 (`wrangler dev` for local dev; deployment to Cloudflare is parked until secrets/auth are set up).
- `frontend/` — Astro static site, reads `frontend/data/tools.json` at build time.

## Local setup

```bash
cd backend && npm install
wrangler d1 execute policypeek-db --local --file=./schema.sql
cp .dev.vars.example .dev.vars   # fill in ANTHROPIC_API_KEY / ADMIN_TOKEN
npm test                        # security regression tests
npm run dev

cd ../frontend && npm install
npm run dev
```

`backend/wrangler.toml` has a placeholder `database_id` — run `wrangler login` then `wrangler d1 create policypeek-db` and paste the real id in before deploying (not needed for local `--local` dev). `frontend/astro.config.mjs`'s `site:` is also a placeholder domain — see `DECISIONS_NEEDED.md`.

## Status
Rebuild from scratch. Backend (schema, lookup, auth, check, admin, cron) and a first pass of the frontend (landing, /tools, tool detail pages, methodology page, SEO basics) are built and tested locally. Nothing is deployed. See `CLAUDE.md` for architecture/decisions and `DECISIONS_NEEDED.md` for open items, and `.claude/agents/` for the subagent role split (backend/frontend/security/research/docs).
