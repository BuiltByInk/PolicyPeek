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
npm run dev

cd ../frontend && npm install
npm run dev
```

`backend/wrangler.toml` has a placeholder `database_id` — run `wrangler login` then `wrangler d1 create policypeek-db` and paste the real id in before deploying (not needed for local `--local` dev).

## Status
Rebuild from scratch — see `.claude/agents/` for the subagent split (backend/frontend/security/research/docs) and per-endpoint notes.
