# PolicyPeek auth.md

Audience: AI agents and automated clients.

## Summary

- PolicyPeek's public API is read-only and needs **no authentication and no registration**.
- There is **no OAuth**, no agent registration and no provisioning endpoint. No credentials, API keys or tokens are issued to agents.
- Admin and internal endpoints are not available to agents. Do not attempt to access them.

## Public endpoints (no auth)

- `GET https://api.getpolicypeek.com/v1/lookup?domain=<domain>`: the AI-training verdict for a tool's domain.
- `GET https://api.getpolicypeek.com/health`: service health.
- Website pages, as HTML or as Markdown (send `Accept: text/markdown`).

Machine-readable descriptions:

- API catalog (RFC 9727): https://getpolicypeek.com/.well-known/api-catalog
- OpenAPI 3.1 spec: https://getpolicypeek.com/openapi.json
- Developer docs: https://getpolicypeek.com/developers/
- Site summary: https://getpolicypeek.com/llms.txt

## Fair use

Requests may be rate limited. Keep volume reasonable, cache results (verdicts change rarely; each has a `last_checked_at`), and identify your client in the User-Agent.

## Content preferences

Search engines, AI search/answer agents, and link-preview bots are welcome. GPTBot and ClaudeBot are intentionally allowed. A listed set of scrapers is blocked in `robots.txt`.

## Contact

Questions: inkllm@mail.grokbot.com
