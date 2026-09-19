# Architecture Notes

How PolicyPeek works, traced from the code. The first part ("Current architecture") was rewritten on 2026-09-19 and checked against `backend/src/`, `backend/schema.sql`, `backend/wrangler.toml`, `extension/`, `frontend/` and `scripts/` as they were that day. It names files so a claim can be re-checked; if the code has moved on, the code wins. Things I could not verify from the repo are collected in the last section of this part and marked "unverified" where they come up. For what is live versus built-but-not-deployed, see `changelog.md` and the current `DEPLOY_RUNBOOK_*.md`. The older design write-up that used to be this file's only content is kept at the bottom, marked historical.

---

# Current architecture

## 1. Shape of the system

```
browser extension (popup)  --GET /v1/lookup, POST /v1/check-->  Cloudflare Worker  <--->  D1 (SQLite)
website submit form        --GET /v1/lookup, POST /v1/check-->  (api.getpolicypeek.com)       ^
                                                                    |                        |
                                                                    +-- Anthropic API        |
                                                                    +-- DNS-over-HTTPS,      |
                                                                        archive.org          |
                                                                                             |
static website (Astro) <-- builds from frontend/data/tools.json <-- scripts/refresh-site.mjs -+
                                                                    (read-only SELECT on the live D1, run by Elliot)
```

- **Backend** (`backend/`): one Cloudflare Worker (`src/index.ts`) plus one D1 database (`policypeek-db`, binding `DB`). It serves the two public endpoints and the admin endpoints, and runs three cron jobs. Custom domain `api.getpolicypeek.com` is configured in `backend/wrangler.toml`.
- **Website** (`frontend/`): Astro, `output: "static"`. Every page is built from `frontend/data/tools.json`; the site never calls the API when it builds. The only browser-side API calls are the submit form (`SubmitTool.astro`) posting to `PUBLIC_API_BASE_URL` and polling `/v1/lookup`.
- **Extension** (`extension/`): Manifest V3, popup only (no background script or content script). It calls the API directly.
- **Two stores of the same catalog.** D1's `tools` table is the source of truth: the publish pipeline writes only there. `frontend/data/tools.json` is a generated snapshot of it, refreshed by hand (see section 8). The API and extension therefore show a newly published tool immediately; the site shows it only after a site refresh and deploy.
- **The principle that shapes everything:** the LLM step (`src/extraction.ts`) returns facts only; `computeVerdict()` in `src/rules.ts` is the one place a verdict is assigned. The verdict rules are described in `CLAUDE.md` (and `rules.ts` is the source of truth over any doc).

## 2. Endpoints

Routing is in `backend/src/index.ts`. Anything not matched returns `404 {"error":"not_found"}`.

### Public

| Method and path | Auth | What it does |
|---|---|---|
| `GET /` and `GET /health` | none | `{"ok":true,"service":"policypeek-backend"}` |
| `OPTIONS /v1/lookup`, `OPTIONS /v1/check` | none | CORS preflight, 204. |
| `GET /v1/lookup?domain=<host>` | optional `X-Api-Key` | Looks up a published tool. Accepts a bare host or a URL. 400 `missing_domain` / `invalid_domain`; 404 `not_found` (with the normalised `domain`). The lookup walks from the full host up through parent domains (`suffixCandidates` in `lookup.ts`), skipping public suffixes such as `co.uk` or `github.io`, and returns the most specific published match; `matched_domain` says which row matched. Free-tier response: `domain`, `matched_domain`, `name`, `compliance_status`, `summary`, `shared_domain` (boolean), `last_checked_at` (null if never recorded). A paid key adds `data_retention`, `trains_on_user_data`, `gdpr_mentioned`, `source_urls`, `verified`. |
| `POST /v1/check` | optional `X-Api-Key` | Submits a domain and a policy URL for checking. Body `{"domain", "source_url", "name"?}`. Returns 202 `{pending_check_id, domain, status:"pending", is_recheck, sourced_from_archive}` and does the extraction in the background (`ctx.waitUntil`). Errors: 400 `invalid_json`, `invalid_domain` (also for a public suffix), `missing_source_url`, `invalid_source_url`, `source_url_domain_mismatch`, `blocked_url`; 413 `payload_too_large`; 429 `daily_check_limit_reached` or `daily_capacity_reached` (with `Retry-After` and `resets_at`); 502 `fetch_failed`; 500 `insert_failed`. No key is needed: a missing or invalid key just means free tier (rate-limited, see section 6). |

Both public endpoints add permissive CORS headers (`src/cors.ts`); the admin routes deliberately do not.

### Admin (header `X-Admin-Token`, compared in constant time against the `ADMIN_TOKEN` secret; 401 `unauthorized` otherwise)

| Method and path | What it does |
|---|---|
| `GET /v1/admin/pending` | Lists every `pending_checks` row, newest first, with `extracted_facts`, `extraction_error`, and for rows in `extracted` status a computed `queue_reason` (why it wasn't auto-published; a `queued_for_review: ...` note in `extraction_error` takes priority). |
| `POST /v1/admin/pending/:id/approve` | Publishes a queued row: recomputes the verdict from the stored facts with `computeVerdict` (no verdict is passed in), inserts or updates the `tools` row, logs to `compliance_changelog`, marks the row `approved`. Records `auto_published = 0`. 404 `pending_check_not_found`; 400 `not_yet_extracted`. |
| `POST /v1/admin/pending/:id/reject` | Marks the row `rejected` unless it is already `approved` (404 `pending_check_not_found_or_already_approved`). |
| `POST /v1/admin/tools/:id/demote` | Body `{"reason": "..."}`. Sets a published tool to `unrated`, clears `trains_on_user_data`, `opt_out_available` and `summary`, and logs a `compliance_changelog` row containing the reason and the old values. Compare-and-swap on the status it read. 400 `reason_required`; 404 `tool_not_found`; 409 `already_unrated` or `status_changed_meanwhile`. |

There is no endpoint that creates API keys, and no code in `backend/src` or `scripts/` inserts into `api_keys`, so a key has to be added directly in the database.

## 3. Tables

Defined in `backend/schema.sql`; changes to an existing database go through `backend/migrations/` (each with a rollback file).

**`tools`** (published, rated tools)
- `id`, `name`, `domain` (UNIQUE), `created_at`, `updated_at`.
- `compliance_status`: one of `not_compliant`, `compliant`, `compliant_with_caveats`, `unrated`, `shared_domain_unverified`, `not_ai_tool` (CHECK constraint; default `unrated`). Because SQLite can't alter a CHECK in place, adding a value to an existing database needs a table-rebuild migration (`2026-09-18-add-not-ai-tool-status.sql` did this for `not_ai_tool`).
- Facts: `data_retention` (text), `trains_on_user_data`, `gdpr_mentioned`, `opt_out_available` (each 0, 1 or NULL for unknown; `opt_out_available` was added by `2026-09-13-add-opt-out-available.sql`).
- `source_urls`: JSON array as text; the first entry is the page rechecks fetch.
- `verified`: 1 means "this is a live published row" (the recheck job selects on it). It does **not** mean a human reviewed it.
- `auto_published`: 1 if the row was last written by the automatic path, 0 if by a human `/approve`. The tool page's "reviewed by a human" line reads this field, inverted.
- `shared_domain`: 1 forces the `shared_domain_unverified` verdict. `sourced_from_archive`: 1 if the source was a Wayback snapshot.
- `summary`: one line shown with the badge (normally the first extracted quote; a fixed sentence for shared-domain rows).
- `last_checked_at`, `last_attempt_at`, `last_check_note` (added by `2026-09-19-add-last-checked.sql`): when the entry was last confirmed, when a recheck was last attempted, and why the last attempt did not confirm it.

**`pending_checks`** (every submission and every recheck; the review queue)
- `id`, `domain`, `name`, `is_recheck`, `source_url`, `created_at`, `updated_at`.
- `status`: `pending` (extraction not finished or failed), `extracted` (facts stored; either just about to auto-publish or waiting in the queue), `approved`, `rejected`.
- `raw_fetch`: the cleaned page text, truncated to 20,000 characters. `extracted_facts`: JSON facts (`trains_on_user_data`, `data_retention`, `gdpr_mentioned`, `opt_out_available`, `relevant_clauses`); never a verdict. `extraction_error`: the failure reason, or a `queued_for_review: ...` / `auto_publish_raced: ...` / `auto_publish_failed: ...` note that explains why a row is waiting.
- `shared_domain`, `sourced_from_archive`, `archived_source_url`.

**`compliance_changelog`**: `tool_id`, `old_status`, `new_status`, `note`, `changed_at`. Two triggers on `tools` write a row on insert and on a real status change (`trigger: insert` / `trigger: update`); the admin code also writes an explicit row (approve, auto-publish, demote) only when the status actually moved. So one status change usually produces two rows.

**`api_keys`**: `key_hash` (SHA-256 hex of the key; the raw key is never stored), `tier` (`free` or `paid`), `label`, `revoked`, `created_at`. The batch script `scripts/batch-submit.mjs` sends one (from the `POLICYPEEK_API_KEY` environment variable).

**`anonymous_check_log`**: `client_ip`, `day_bucket` (UTC `YYYY-MM-DD`), `checked_at`, with PRIMARY KEY `(client_ip, day_bucket)`. One row is one used free check for that client on that UTC day.

## 4. From submission to badge

`POST /v1/check` (`src/check.ts`), in order:

1. Resolve tier from `X-Api-Key`. For the free tier, reserve the day's slot (section 6); refuse with 429 if it can't be reserved.
2. Read the body (16,384-byte cap), parse it, validate `domain` (regex, length, not a public suffix via `tldts` in `domainUtil.ts`), `source_url` (present, at most 2,048 characters, fragment dropped). Only a paid-key caller's `name` is kept; for anonymous callers the tool shows its domain.
3. The source URL's host must be the domain, a subdomain of it, or the curated cross-domain source (`crossDomainSources.ts`, currently `bolt.new` to `stackblitz.com`); otherwise 400 `source_url_domain_mismatch`.
4. Fetch through the SSRF wrapper (section 7). If the live fetch fails for any reason other than being blocked by the SSRF rules (connection failure, timeout, or an HTTP error status), fall back to the last Wayback Machine snapshot (`waybackFallback.ts`) and mark the result `sourced_from_archive`. Any failure up to here releases the day's slot.
5. Strip the HTML to text (`htmlClean.ts`), insert a `pending_checks` row, return 202. Record whether the domain already has a `tools` row (`is_recheck`) and whether it is a known shared domain (`sharedDomains.ts`: google.com, microsoft.com, amazon.com, apple.com, meta.com, adobe.com, salesforce.com, oracle.com, ibm.com, vercel.com, and everything under them).
6. In the background (`runExtraction`): call Claude Haiku (`claude-haiku-4-5-20251001`, first 15,000 characters of text) for facts only. The reply is treated as untrusted: non-boolean facts become null, text is stripped of control and invisible characters and length-capped (`extraction.ts` `sanitizeFacts`, `textUtil.ts`). An empty page is a clear `empty_extracted_text` error rather than an API call. A failure here leaves the row in `pending` with the reason in `extraction_error`.
7. Publish decision (next section).

### The three-tier publish rule

- **Tier A, auto-publish.** `evaluateAutoPublish` (`src/autoPublish.ts`) runs on every finished extraction, including rechecks. It returns "eligible" only when none of these hold, checked in this order: the source came from the Wayback archive; the domain has no `tools` row yet and the computed verdict is `compliant` or `compliant_with_caveats` (a favourable badge for a brand-new domain always waits for a person; added 2026-09-19); `trains_on_user_data` is null; `trains_on_user_data` is true and `opt_out_available` is null; it is a recheck and the verdict differs from the published one. A shared domain does not block eligibility (its verdict is always `shared_domain_unverified`). Note that `not_ai_tool` is only reachable when `trains_on_user_data` is null, so it is always queued. Eligible rows are written by `tryAutoPublishAtomic` (`src/admin.ts`): a fresh read of the tool, then an insert that does nothing on a duplicate domain, or an update guarded on the status just read; if another writer got there first the row is queued with an `auto_publish_raced` note.
- **Checks before tier A** (`runExtraction`, applied first): a redirect that ended on a different site than the submitted domain (the same host, its subdomains, the curated source, or `www.` on either side count as the same site; an https to http downgrade counts as leaving), a source host different from the one the published entry was built from, or a first publish whose source page is not on the submitted domain itself (or its `www.`) all queue the row for review with a `queued_for_review: ...` note, whatever the facts say.
- **Tier B, review queue.** Everything not published stays `extracted` (or `pending` if extraction failed) and shows up in `GET /v1/admin/pending` with its reason. A human approves or rejects it.
- **Tier C, rechecks.** The daily cron (section 5) re-runs published tools through the same fetch, extract and Tier A/B path. An unchanged verdict silently re-confirms (advances `last_checked_at`); a changed verdict, or anything that can't be confirmed, queues and does not advance the date, recording a reason in `last_check_note`.

## 5. Cron jobs

Declared in `backend/wrangler.toml` (`crons = [...]`) and dispatched by exact string in `src/index.ts` (`cronJobFor`; an unknown schedule logs a warning and runs nothing).

| Schedule (UTC) | Job | What it does |
|---|---|---|
| `*/15 * * * *` | `checkStuckPending` (`src/cron.ts`) | Logs `pending_checks` rows still `pending` after 30 minutes. Rows that crossed 30 minutes within the last 16 (so about once each) also send a Telegram alert, except `empty_extracted_text` failures. The alert goes through `src/alert.ts` and does nothing unless the `ALERT_BOT_TOKEN` and `ALERT_CHAT_ID` secrets are set. |
| `0 4 * * *` | `runDueRechecks` (`src/cron.ts`) | Picks up to 5 published (`verified = 1`) tools not confirmed for 30 days and not attempted for 3, oldest first; re-fetches each tool's first source URL, inserts a `pending_checks` row with `is_recheck = 1`, and runs the normal extraction and publish path. On Mondays it also alerts (same secrets) about tools not re-confirmed for 60 days. (This replaced an earlier monthly all-at-once job.) |
| `30 3 * * *` | `purgeOldAnonymousChecks` (`src/rateLimit.ts`) | Deletes `anonymous_check_log` rows from before today's UTC day, so stored client IPs live at most about a day. |

`wrangler.toml` also enables Workers Logs (`[observability] enabled = true`) with `invocation_logs = false`, so only the Worker's own log lines are stored, not per-request metadata.

## 6. Rate limiting and abuse controls

In the Worker (all in code):

- **Free tier: one check per client per UTC day.** `tryReserveDailySlot` (`src/rateLimit.ts`) does `INSERT OR IGNORE` into `anonymous_check_log`; the primary key makes the reservation atomic. If the insert is ignored, 429 `daily_check_limit_reached`. The slot is released (deleted) when the request fails validation, the fetch fails, or an unexpected error is thrown, so a failed request doesn't cost the caller their check. Once a 202 is returned the slot stays used, even if the background extraction later fails.
- **Global ceiling.** After reserving, the day's rows are counted; if more than `GLOBAL_DAILY_CHECK_CAP` (200) the caller's slot is given back and the response is 429 `daily_capacity_reached`. Approximate by design (concurrent requests can overshoot slightly).
- **Paid keys are exempt** from both (they never reserve a slot). Lookups are not counted at all.
- **Client identity** (`src/auth.ts`): `CF-Connecting-IP`; `X-Forwarded-For` is believed only when the request URL is localhost; IPv6 is reduced to its /64; IPv4-mapped IPv6 maps to the IPv4 address; anything unparseable becomes `unknown` (one shared bucket).
- **Input limits:** request body 16,384 bytes; `source_url` 2,048 characters; `name` 100 characters (paid only); hostnames 253 characters.
- **Admin token:** SHA-256 of both sides, then a constant-time compare (`requireAdminToken`).
- **Outside the repo (unverified):** Cloudflare dashboard rate-limit rules (per-IP limits on `/v1/lookup`, `/v1/check` and `/v1/admin/*`) and an Anthropic spend limit are recorded as recommended settings in `DECISIONS_ARCHIVE.md` and the runbook, but they live in dashboards. I cannot tell from the repo whether they are set.

## 7. The SSRF-safe fetch wrapper

`backend/src/ssrf.ts` (`safeFetchTextWithFinalUrl`, used for every submitted or recheck URL, and for the archive snapshot). Submitted URLs are untrusted. For the first URL and for every redirect hop it:

- allows only `http`/`https`, ports 80/443 (or none), and no credentials in the URL;
- blocks `localhost`, `metadata.google.internal`, `*.localhost` (trailing dots stripped) and literal IPs in private, loopback, link-local (including the cloud metadata address), CGNAT, benchmarking, TEST-NET, multicast and reserved IPv4 ranges, and IPv6 loopback, link-local, unique-local, NAT64, 6to4, Teredo, SIIT and IPv4-mapped forms; an IPv6 literal it can't parse is refused;
- resolves any non-literal hostname itself through Cloudflare DNS-over-HTTPS (A and AAAA) and refuses if any answer is blocked, and fails closed if the resolver errors;
- follows redirects manually (at most 5), re-validating each hop, with a 20-second timeout per hop and a 500,000-byte body cap, sending the user agent `PolicyPeek-Checker/1.0`.

Known residual risk, accepted and documented in the file header: a Worker can't pin the IP its own `fetch()` connects to, so a hostile DNS zone that answers differently the second time (DNS rebinding) is not fully closed. The wrapper also reports the final URL so `check.ts` can tell whether the text came from the submitted site.

## 8. Data flow: extension and site

**Extension** (`extension/popup.js`, `badgeCopy.js`, `config.js`, `manifest.json`):
1. The popup opens on the active tab; only `http`/`https` pages are considered, and the tab's hostname is what gets looked up.
2. It checks a per-hostname cache in `chrome.storage.local` (5-minute TTL), else calls `GET {API_BASE_URL}/v1/lookup?domain=<hostname>` (no key). 200 draws the badge from `BADGE_COPY` (with a "checked <date>" line from `last_checked_at`) and sets the toolbar icon; 404 shows "not in catalog" and a "Check this site" button.
3. That button calls `POST /v1/check` with `{domain: <hostname>, source_url: <the tab's URL with query string, fragment and credentials removed>}`, so it works best from the policy page. On 202 it clears the cached "not in catalog", then polls lookup every 3 seconds for up to 10 tries, and only accepts a result whose `matched_domain` equals the hostname. If nothing publishes it says there is no set time. 429 messages distinguish "you used today's check" from "PolicyPeek reached its daily limit".
4. Permissions: `activeTab`, `storage`, and host permission for `https://api.getpolicypeek.com/*`. The Firefox manifest declares `browsingActivity` as required data collection. `config.js` points at production.

**Website** (`frontend/`):
- Pages: home, `/tools`, `/tools/<domain>/` (one per catalog row, from `getStaticPaths`), `/about`, 404. Sitemap via `@astrojs/sitemap`, which leaves out `not_ai_tool` pages; those pages are also `noindex`.
- The catalog file `frontend/data/tools.json` is generated, not hand-edited: `scripts/generate-tools-json.mjs` runs a read-only `SELECT` against the live D1 and writes `tools.generated.json`; `scripts/refresh-site.mjs` diffs it against `tools.json`, asks before replacing it (with a backup in `backups/`), builds, verifies the build, and only with `--deploy` and a second confirmation runs `wrangler pages deploy`. Elliot runs it; agents don't.
- The submit form (`SubmitTool.astro`) validates the domain and that the policy link is on that domain or a subdomain, posts to `PUBLIC_API_BASE_URL` (set in `frontend/.env.production`), then polls `/v1/lookup` every 3 seconds for up to 20 tries with the same `matched_domain` rule as the extension.
- The tool page shows the badge, summary, sources, a "reviewed by a human" line read from `auto_published`, and the last-checked date from `last_checked_at`.

## 9. Not verified from the repo

- Whether each migration has been applied to the production D1 (`not_ai_tool` status, `last_checked` columns), and what production currently contains. The docs agent never reads production; the runbook has read-only checks for Elliot.
- Whether the Cloudflare dashboard rate-limit rules, the Anthropic spend limit, and the alert-bot secrets are set.
- Which Worker plan is in use (relevant to how many outbound calls one cron run may make; the manager log says this was not checked).
- What is deployed right now versus the code here: the changelog marks the work after the 2026-09-17 launch as not deployed.

---

# Historical: `tools.json` versus D1, as analysed on 2026-09-01

**Status (2026-09-19): this write-up is historical.** It described the situation before the real D1 existed and before any export path was built. Since then: a real production D1 exists; `tools.json` is now generated from D1 by `scripts/generate-tools-json.mjs` and refreshed by `scripts/refresh-site.mjs` (this is what option B below proposed); `tools.json` now carries `auto_published` and `last_checked_at`. The claims "no code path connects the two", "nothing writes this file programmatically", and the local-D1 coverage numbers below are therefore out of date. The original text is kept unchanged for the reasoning.

## `frontend/data/tools.json` vs. D1's `tools` table — two independent stores of the same data, no sync path between them (2026-09-01)

### Why this doc exists

Two separate incidents surfaced this in one afternoon: Phase 1 found local
dev D1 only has 13 of 33 published tools seeded, and a same-day follow-up
fix (Copilot/v0's unverified-reason summary text) only reached the
website because the extension reads a completely different data source
than the site does. Before Phase 2 pushes 21 more tools through the real
pipeline — which writes to D1, not `tools.json` — this needed tracing
properly instead of patched around a third time.

### What actually reads and writes each store, traced directly (not assumed)

**`frontend/data/tools.json`** — read only, at Astro build time, by:
- `frontend/src/pages/index.astro`
- `frontend/src/pages/tools/index.astro`
- `frontend/src/pages/tools/[domain].astro`

Nothing in the codebase writes this file programmatically. Every entry in
it was placed there by a direct edit — git log's "Data: publish X" commits
edit this file's JSON by hand (agent- or human-assisted), not via any
script or export. `README.md` and `.claude/agents/frontend.md` both
already say the static site "reads `tools.json` at build time" with no
live API calls — confirmed true by grep, not just by the docs' claim.

**D1's `tools` table** — read and written by backend code only:
- Read: `lookup.ts` (`GET /v1/lookup`, what the browser extension and any
  API consumer actually see), `check.ts` (recheck detection), `cron.ts`
  (monthly recheck), `admin.ts` (recheck detection for approval)
- Written: **only** `admin.ts::approvePendingCheck`, called from
  `check.ts::runExtraction` when `evaluateAutoPublish` (`autoPublish.ts`)
  decides a submission is clean enough to auto-publish, or from a human
  hitting the admin approve endpoint for a queued one. This is the real
  growth-loop write path — `POST /v1/check` → extraction → auto-publish-
  or-queue → `approvePendingCheck` INSERTs or UPDATEs a `tools` row.

**No code path connects the two.** Nothing exports D1 into `tools.json`,
and nothing imports `tools.json` into D1. They're maintained by two
entirely separate mechanisms that happen to describe the same catalog.

### Field-level diff (not just structural — actually queried both stores)

D1's schema (`schema.sql`) has two columns `tools.json` doesn't carry at
all: `auto_published` and `sourced_from_archive` (plus `id`/`created_at`/
`updated_at`, which are store-internal, not really "data"). Every other
field D1 has, `tools.json` also has.

Content comparison, for the 13 domains that currently exist in **both**
local D1 and `tools.json` (`amazon.com`, `bolt.new`, `deepl.com`,
`fireflies.ai`, `granola.ai`, `heygen.com`, `ideogram.ai`, `jetbrains.com`,
`kagi.com`, `lumalabs.ai`, `vercel.com`, `windsurf.com`, `you.com`) — every
shared field (`name`, `compliance_status`, `data_retention`,
`trains_on_user_data`, `gdpr_mentioned`, `source_urls`, `verified`,
`shared_domain`, `summary`) matched exactly, **except `summary`**, which
is now fixed for `vercel.com` (this session's Task 1, below) and was
never divergent for the other 12. So content drift so far is narrow — one
field, two tools — but coverage drift is not narrow: **19 of 33 tools in
`tools.json` don't exist in local D1 at all** (`openai.com`, `claude.com`,
`copy.ai`, `cursor.com`, `elevenlabs.io`, `google.com`, `github.com`,
`grammarly.com`, `jasper.ai`, `microsoft.com`, `midjourney.com`,
`notion.com`, `otter.ai`, `perplexity.ai`, `replit.com`, `runway.com`,
`sourcegraph.com`, `stability.ai`, `zoom.com`). `microsoft.com` (Copilot)
being in that list is exactly why Task 1 below could only fix `vercel.com`
— there's no D1 row to update for Copilot.

(Caveat: this is **local dev D1** specifically. Whether a real/production
D1 would show the same gap is a separate question this doc doesn't answer
— deploy is parked per `CLAUDE.md`, so there's no production D1 to check
against right now.)

### The three realistic options, with this codebase's actual mechanics

**A. `tools.json` as source of truth; D1 becomes a generated/synced copy.**
Would need a new sync script/migration that upserts D1 rows from
`tools.json` — doesn't exist today. The real wrinkle: D1 isn't just a
read cache today, it's the **live write target of the actual growth
loop** (`POST /v1/check` → auto-publish writes straight into D1). Under
this option, a new tool that auto-publishes writes to D1 first, with
nothing ever reflecting it back into `tools.json` unless a *second*,
reverse sync also exists — at which point "`tools.json` is the source"
stops being true in practice. This option fights the direction data
already flows in.

**B. D1 as source of truth; `tools.json` becomes a generated static
snapshot.** Needs a new export step (e.g. `wrangler d1 execute --json`
piped into `frontend/data/tools.json`) run before `astro build` —
also doesn't exist today, but it matches the direction data already
flows in: the real pipeline writes to D1, so making D1 authoritative and
exporting *from* it needs one new script, not two. Side benefit: D1
already has `auto_published`, which nothing on the site surfaces today —
this option would make that field available to fix the still-open
"`/about`'s 'a human reviews it' claim doesn't match practice" item
elsewhere in `DECISIONS_NEEDED.md` for free, instead of as separate work.
Real cost, worth naming since it's Phase-3-relevant: a production build
would need the build pipeline to have **read** access to a real D1
instance at build time — a smaller ask than lifting the current "no
deploy" freeze (this is a read, not the deploy/write actions that freeze
covers), but it's a new build-time dependency that doesn't exist yet and
should be planned before Phase 3, not discovered during it.

**C. Both maintained independently by convention, with a periodic diff
check that warns or fails on disagreement.** Cheapest to build right
now — essentially a formalized version of the by-hand comparison this doc
already did above (query D1, load `tools.json`, diff shared fields,
exit non-zero on mismatch; could run as a pre-commit hook or a CI step).
Doesn't fix the actual problem: someone still manually applies every
correction twice, which is exactly the toil that produced today's two
incidents. Reasonable **stopgap** for Phase 2 if B isn't built in time,
not a good permanent answer at 21-more-tools volume.

### Recommendation (recommendation only — Elliot's call, not applied)

**B**, for Phase 2 onward: it matches the direction data already flows in
today (D1 is already the real pipeline's write target), it removes a
whole class of "which one do I edit" bugs, and it pays down an unrelated
open item (`auto_published` visibility) as a side effect. The cost — a
build-time D1 read dependency — is real but smaller than it looks, and is
better decided deliberately before Phase 3's deploy planning than
backed into during it.

If B's export script isn't feasible before Phase 2 starts, **C as an
explicit, temporary bridge** (not silent status quo) is preferable to
continuing to hand-edit both stores with no check at all — cheap to add,
and it would have caught both of today's incidents immediately instead of
via manual investigation after the fact.

**Not recommending A** — it works against the one real write path that
already exists in this codebase.

This is a recommendation, not a decision. No schema changes, sync
scripts, or `tools.json` restructuring have been made — implementation is
a separate follow-up once Elliot picks a direction.
