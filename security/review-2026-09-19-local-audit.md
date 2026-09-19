# Security review — 2026-09-19 (local full-repo audit)

Scope: backend (`backend/src/*`), extension (`extension/*`), frontend
(`frontend/src/*`), dependency audit. Done by reading the code; **nothing
was run against production** (no live API calls, no `wrangler d1 execute
--remote`, no deploy). Everything below is therefore about the code in the
repo, not about what is deployed. Elliot asked for the audit and for the
safe items to be fixed in the same pass (Telegram, 2026-09-19), so the
"Fixed" items were patched directly rather than filed as diffs.

Backend tests: 73 -> 116 passing. `tsc --noEmit` clean. Frontend builds
(37 pages).

## Fixed in this pass (local, not deployed)

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | LLM output was trusted by shape. `extractFacts` cast the parsed JSON to `ExtractedFacts` without checking. A page (attacker-controlled: anyone can submit a domain they control) could steer the model into returning a non-boolean fact, an object where a string belongs, or very long text. Those flow into `computeVerdict`, D1 binds, `tools.json`, the site and the popup tooltip. | Medium | `sanitizeFacts()` in `extraction.ts`: facts must be real booleans else `null` (which queues or rates `unrated`, never a confident verdict); free text is control-char-stripped and length-capped (300 / 500 chars, 10 clauses). |
| 2 | Submitted `name` and request body were unbounded, and `name`/`domain`/`source_url` were `.trim()`-ed without type checks. A non-string field threw an unhandled 500 after the daily slot was already reserved. `name` becomes the public display name when a new domain auto-publishes. | Medium | `check.ts`: body read as text and capped at 10,000 chars (413), must be a JSON object, fields type-checked, `cleanSubmittedName()` caps at 100 chars and strips control characters, `source_url` capped at 2,048 chars, fragment dropped. |
| 3 | IPv6 rate-limit bypass. The daily cap keys on the client IP. One IPv6 /64 is billions of addresses, so a single machine could get a fresh free check (a real Haiku call) per request. | Medium | `auth.ts`: `normalizeIpForRateLimit()` keys IPv6 on its /64. IPv4 unchanged. |
| 4 | SSRF wrapper missed some non-public ranges and any-port fetches. Not blocked: CGNAT 100.64/10, 198.18/15, multicast/reserved (224+). Any port was allowed, so a submitted URL could probe other services on a host. Credentials in the URL were passed through. | Low (Workers can't reach private nets, but cheap to close) | `ssrf.ts`: blocks those ranges, allows only ports 80/443, rejects `user:pass@` URLs. |
| 5 | Extension sent the tab's full URL (query string and fragment included) as `source_url`. Query strings often hold session tokens or share links, and `source_url` is stored and shown publicly as a source link. For a privacy tool this is the worst place to leak them. | Medium | `extension/popup.js`: `urlWithoutQueryOrHash()` strips query, fragment and credentials before sending. Trade-off: a policy page that lives at `/legal?page=privacy` will submit as `/legal`. |
| 6 | Frontend dependency advisories: 6 (1 critical in astro's AVIF image path and a base-path check, plus devalue, js-yaml, nanoid, sharp, svgo). All build/dev-time, the site is static. | Low in practice | `npm audit fix` in `frontend/`: astro 7.1.6 -> 7.3.3, 0 advisories. Rebuilt; hancocyber still `noindex` and excluded from the sitemap. Backend: 0 advisories. |
| 7 | `not_ai_tool` toolbar icons missing (`iconPathsFor` pointed at files that didn't exist, so the toolbar icon would break on those sites). | Low (functional) | Generated `extension/icons/not_ai_tool-{16,32,48,128}.png`: gray disc with a minus, distinct from the plain gray "not in catalog" dot. Stopgap art, same as the caveats icons. |

## Decisions — ruled by Elliot 2026-09-19 (see DECISIONS_NEEDED.md for what was built)

Items 1-3 and 6 below were built locally after his ruling; item 5's rate limits
are Cloudflare dashboard rules to apply by hand; item 7 is still unverified. The
text below is the original finding, kept for the record.

1. **Redirect targets are not re-checked against the submitted domain.**
   `isSourceHostAllowedForDomain` only checks the *first* URL. `safeFetchText`
   then follows up to 5 redirects to any public host. If the submitted
   domain has an open redirect (common on large sites), an attacker can make
   the fetch land on a page they control and publish a verdict for a domain
   they don't own. Fix is small (re-check each hop), but it would also break
   any tool whose policy legitimately redirects to another domain (e.g. a
   hosted-policy vendor). Needs a decision on whether to allow same-company
   redirects via the `crossDomainSources.ts` map, or to route any
   cross-domain redirect to human review instead of auto-publish.
2. **No global cap on `/v1/check` spend.** The daily cap is per client. A
   pool of proxies, or many IPv4 addresses, can still drive unlimited
   Anthropic calls. Suggest a global daily ceiling (count of today's
   `anonymous_check_log` rows) plus a Cloudflare billing/usage alert on the
   Anthropic key. Needs a number from you, and it touches the "never gate
   checks" principle, so it's a product call.
3. **Auto-publish trusts anonymous submissions for new domains.** A clean
   extraction from a page the submitter controls publishes immediately as
   `compliant`, with the submitter's chosen `name`. Only their own domain is
   affected (domain lock), but the catalog can show "Stripe — compliant" for
   `not-stripe.example`. Options: show the domain, not the name, for
   auto-published new tools; or hold brand-new domains for review. Design
   decision, per the 2026-08-17 three-tier ruling.
4. **Prompt injection cannot be fully closed** (page text goes to the model).
   Point 1 of the fixed list narrows what a hostile answer can do; the rest is
   the trade-off in item 3.
5. **`/v1/lookup` has no rate limit** and the admin routes have no attempt
   lockout. Both are best handled as Cloudflare rate-limiting rules
   (dashboard), not Worker code. Admin auth itself is timing-safe. Make sure
   `ADMIN_TOKEN` is long and random (can't verify from here).
6. **Stuck-pending alerting** (already open in DECISIONS_NEEDED) — the
   3-day API-key outage happened because nothing delivers the cron warning.
   Still just a `console.warn`.
7. **Production D1 state is unverified from here.** I could not check whether
   `2026-09-18-add-not-ai-tool-status.sql` has been applied to the live
   database (a live read was blocked). Without it, approving hancocyber
   (pending id 10) fails on the CHECK constraint.

## Checked, no issue found

- Admin auth: `X-Admin-Token` compared with hash-then-compare, fail-closed if
  the secret is unset. Admin routes carry no CORS headers.
- SQL: every query uses bound parameters; the only interpolated part is the
  `?,?,?` placeholder list in `lookup.ts`, built from a count.
- XSS: extension writes only via `textContent`/`replaceChildren`; the site
  has one `set:html` (JSON-LD), which escapes `<` and the Unicode line
  separators and is covered by a `</script>` payload test; the tools page
  script uses `textContent`.
- CORS `*` on `/v1/lookup` and `/v1/check` is appropriate (public, no
  cookies).
- Concurrency: the reserve-then-release rate limit and the compare-and-swap
  auto-publish are unchanged and still covered by their tests.
- `rules.ts` was not touched (verdict boundary logic is Elliot's).
