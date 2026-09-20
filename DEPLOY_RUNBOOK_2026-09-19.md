# Deploy runbook — 2026-09-19 (everything built locally since 2026-09-18)

Written for Elliot to run at his computer. Nothing here has been deployed.
Run the steps in order; each has a check and a way back. Anything marked
**(prod)** touches live infrastructure.

What is being shipped: the `not_ai_tool` verdict (built 2026-09-18) plus the
2026-09-19 security hardening, redirect-to-review rule, global daily ceiling,
paid-only names, stuck-pending alert, submission feedback on the site and
extension, a daily purge of stored client IPs, a whole-word fix to the
`not_ai_tool` keyword matching, and a frontend dependency upgrade (astro 7.1.6 -> 7.3.3). Details:
`changelog.md` (2026-09-19) and `DECISIONS_NEEDED.md` (top entry).

## 0. Before anything (local, safe)

```bash
cd ~/policypeek/backend && npm test && npx tsc --noEmit    # expect all tests passing, no errors
cd ../frontend && npm run build                            # expect "37 page(s) built"
```

## 1. Database migration **(prod)** — must come BEFORE the backend deploy

Why first: the new backend can produce `not_ai_tool`, and the live table's
CHECK constraint may not allow it yet. Old backend + new schema is harmless
(the new CHECK is a superset), so the safe order is schema first.

> **Step 1 is DONE (2026-09-20).** Both migrations are on the live database.
> - `2026-09-18-add-not-ai-tool-status.sql` was applied on the evening of 2026-09-18,
>   after an export saved as `backend/backup.sql` (gitignored, 32 tools,
>   pre-migration). That is from the wrangler logs, not a note made at the time.
> - `2026-09-19-add-last-checked.sql` was applied on 2026-09-20 at about 07:30 UTC,
>   after a fresh export, `backups/policypeek-db-pre-last-checked-2026-09-20.sql`
>   (33 tools). The wrangler log shows it completed with no errors, followed by the
>   row-count check.
> - **Do NOT run either migration again.** The first rebuilds the table with a fixed
>   column list and would drop the last-checked columns; the second would fail with
>   `duplicate column name`. Continue from step 2 (optional secrets) or step 3 (backend deploy).

```bash
cd ~/policypeek/backend
# 1a. Is it already applied? (read-only)
npx wrangler d1 execute policypeek-db --remote \
  --command "SELECT sql FROM sqlite_master WHERE name='tools'"
#     -> if the CHECK list contains 'not_ai_tool', the FIRST migration in 1c is already applied,
#        but the second (last-checked) may not be: check that separately with
#        npx wrangler d1 execute policypeek-db --remote --command "SELECT last_checked_at FROM tools LIMIT 1"
#        (an error 'no such column' means it still needs applying). Still do 1b (back up) first.

# 1b. Back up first
npx wrangler d1 export policypeek-db --remote --output ../backups/policypeek-db-pre-not-ai-tool-2026-09-19.sql

# 1c. Apply, IN THIS ORDER (each only if not already applied)
npx wrangler d1 execute policypeek-db --remote --file migrations/2026-09-18-add-not-ai-tool-status.sql
npx wrangler d1 execute policypeek-db --remote --file migrations/2026-09-19-add-last-checked.sql
#     (the second adds last_checked_at / last_attempt_at / last_check_note; it must come
#      AFTER the first, which rebuilds the table and would drop them, and BEFORE the backend deploy)

# 1d. Check it
npx wrangler d1 execute policypeek-db --remote \
  --command "SELECT COUNT(*) AS tools FROM tools"        # same number as before the migration
npx wrangler d1 execute policypeek-db --remote \
  --command "SELECT sql FROM sqlite_master WHERE name='tools'"   # now lists 'not_ai_tool'
```

Rehearsed locally on 2026-09-19 against a throwaway copy of the old schema
with sample rows: all rows, ids, changelog rows, both triggers and the index
survived, foreign-key check clean, an approve of a not_ai_tool tool worked
afterwards, and the rollback file and a re-apply both worked. (Local
SQLite/miniflare, not the real D1, so the backup in 1b is still the safety net.)

**Way back:** roll the backend back first, then undo the migrations in the REVERSE order:
`npx wrangler d1 execute policypeek-db --remote --file migrations/2026-09-19-add-last-checked.rollback.sql`
(drops the three new columns), then, only if you also need to,
`.../2026-09-18-add-not-ai-tool-status.rollback.sql` (maps any `not_ai_tool` rows back to
`unrated`). Undoing them in the other order breaks the second rollback, because the
not-ai-tool rebuild recreates the table without the new columns. Or restore the export from 1b.

## 2. Optional secrets for the stuck-pending alert **(prod)**

In BotFather create a separate alert bot (not the bot Claude Code uses), press
Start on it once from your account, then:

```bash
cd ~/policypeek/backend
npx wrangler secret put ALERT_BOT_TOKEN     # the new bot's token
npx wrangler secret put ALERT_CHAT_ID       # your Telegram user id
```
Skip it and the alert simply stays off; nothing else depends on it.

## 3. Backend deploy **(prod)**

```bash
cd ~/policypeek/backend && npx wrangler deploy
```
Checks (all read-only, or rejected before they cost anything):
```bash
curl -s https://api.getpolicypeek.com/health                          # {"ok":true,...}
curl -s "https://api.getpolicypeek.com/v1/lookup?domain=openai.com"   # normal verdict JSON
curl -s https://api.getpolicypeek.com/v1/admin/pending                # 401 unauthorized
curl -s -X POST https://api.getpolicypeek.com/v1/check -H 'content-type: application/json' -d '[]'
                                                                       # 400 invalid_json (does not use up your daily check)
```
**Way back:** `npx wrangler rollback` (previous Worker version), or the
Deployments tab in the dashboard.

### 3a. Rechecks and "last checked" (new tonight)

The old monthly all-at-once recheck is replaced by a daily job (04:00 UTC, `0 4 * * *`)
that rechecks the 5 most overdue published tools (not confirmed for 30 days, and not
attempted in the last 3 days). Unchanged results advance `last_checked_at`; a changed
verdict queues for you and does NOT advance it; failures are recorded in
`last_check_note`. Every Monday it sends the alert bot a message if any tool hasn't been
re-confirmed for 60 days. The tool pages, the API (`last_checked_at`) and the extension
popup show the date. Existing entries start with `last_checked_at = updated_at`
(an approximation, noted in the migration). After the first day check:
```bash
npx wrangler d1 execute policypeek-db --remote \
  --command "SELECT domain, last_checked_at, last_attempt_at, last_check_note FROM tools ORDER BY last_checked_at LIMIT 10"
```
The static site only shows new dates after step 5.

### 3b. New this afternoon: daily IP purge and quieter logs

The backend deploy also adds a third cron (`30 3 * * *`, daily) that deletes
`anonymous_check_log` rows from before today (client IPs), and turns off
per-request invocation logs (`[observability.logs] invocation_logs = false`) so
only the Worker's own log lines are stored. After deploying:
```bash
npx wrangler d1 execute policypeek-db --remote \
  --command "SELECT day_bucket, COUNT(*) AS n FROM anonymous_check_log GROUP BY day_bucket"
```
Old days remain until 03:30 UTC the next morning; run it again after that and only
today's row(s) should be left. In the dashboard Logs view, confirm you see
your cron `[cron] ...` lines but not one entry per page request. **Only then**
is it accurate for the privacy policy to say IPs are deleted daily and request
details aren't kept.

## 4. Re-approve hancocyber.com **(prod)**

```bash
curl -s -X POST -H "X-Admin-Token: $ADMIN_TOKEN" \
  https://api.getpolicypeek.com/v1/admin/pending/10/approve
# expect: {"tool_id":...,"domain":"hancocyber.com","compliance_status":"not_ai_tool"}
curl -s "https://api.getpolicypeek.com/v1/lookup?domain=hancocyber.com"   # compliance_status: not_ai_tool
```
If the approve fails with a CHECK constraint error, step 1 was not applied.

## 4a. One read-only check from the independent security review **(prod)**

Are any hosting or public-suffix domains already in the catalog? (Expect no rows.)
```bash
npx wrangler d1 execute policypeek-db --remote --command \
  "SELECT id, domain, compliance_status FROM tools WHERE domain IN ('github.io','vercel.app','pages.dev','notion.site','netlify.app','herokuapp.com','co.uk','com.au','co.jp','com.br')"
```

## 4b. Other rows waiting on a live-database write **(prod)**

Recorded in the logs, not verifiable from here (I can't read production).
Look at the queue first, then decide row by row:

```bash
curl -s -H "X-Admin-Token: $ADMIN_TOKEN" https://api.getpolicypeek.com/v1/admin/pending
```
- **Ids 11-15** (zed.dev, warp.dev, fathom.ai, krisp.ai, tldv.io): submitted by
  the batch script on 2026-09-18 evening, all accepted (202). Each either
  auto-published or is sitting in the queue with a stated reason. Approve or
  reject the queued ones. 17 more eligible tools are still unsubmitted
  (`node scripts/batch-submit.mjs` is a dry run until you pass `--go`; default
  5 per run, and it uses your paid key, so the new 200/day ceiling doesn't apply).
- **Ids 4, 5, 6** (Ideogram, JetBrains AI Assistant, Luma AI): nothing to do. The changelog
  records that all three were approved on 2026-09-17/18 and published as `not_compliant`
  (tool ids 2, 1 and 4). The 2026-09-13 note about a pending database correction is
  superseded. (Corrected 2026-09-19: an earlier version of this runbook listed them as
  still waiting.)
- **openai.com recheck** (previous id 7, rejected as a dead row from the API-key
  outage): never resubmitted. Submit it again once the backend is deployed.
- **Held, need a decision, not submitted:** Adobe Firefly, Devin, Suno,
  Character.ai (reasons in `scripts/batch-submit.mjs`).

## 4c. Demote badges that turned out to be unsupported **(prod)**

After reading the flagged sources (see `research/audits/autopublished_factcheck_2026-09-19.md`), for each tool you decide to take back to Unrated (find its id in the queue listing or the tools table):
```bash
curl -s -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"reason":"Stored clause covers only Google Workspace API data, not customer content"}' \
  https://api.getpolicypeek.com/v1/admin/tools/<TOOL_ID>/demote
```
It sets the tool to Unrated, clears its stored training facts, and logs your reason and the old values in the changelog table. A later monthly recheck can't re-promote it on its own. Run step 5 afterwards so the site shows it.

Also new tonight: a favourable first result for a brand-new domain now waits in your queue instead of publishing itself, so expect to see those in `GET /v1/admin/pending` with the reason "brand-new domain with a favourable verdict".

## 5. Site **(prod)**

```bash
cd ~/policypeek
node scripts/refresh-site.mjs --deploy
```
It pulls the live catalog, shows the diff, builds, checks that the
not_ai_tool pages are `noindex` and out of the sitemap, and only deploys after
its own confirm. Then open the live site: `/tools/hancocyber.com/` shows
"Not an AI tool", and try the submit form.
**Way back:** Cloudflare dashboard -> Pages -> Deployments -> roll back to the
previous one.

## 6. Extension

Reload the unpacked extension (or build and submit the new version). It now:
strips the query string from submitted URLs, polls for the verdict after a
submit, has the `not_ai_tool` toolbar icons. Try it on any site not in the
catalog.

## 7. By hand in dashboards (not code)

- **Cloudflare -> Security -> WAF -> Rate limiting rules** (free plan allows
  very few, so in this order): `/v1/admin/*` 10 per minute per IP;
  `/v1/check` POST 5 per minute per IP; `/v1/lookup` 120 per minute per IP.
- **Anthropic console:** set a monthly spend limit and an email usage alert
  (the backstop for the 200-checks-a-day ceiling).
- **Confirm `ADMIN_TOKEN` is long and random** (`openssl rand -hex 32`). If
  unsure: `npx wrangler secret put ADMIN_TOKEN`, then use the new value.

## 8. Afterwards

- `cd ~/policypeek/backend && npx wrangler tail` for a few minutes while
  loading the site and running one submit: no errors.
- Workers Logs is now on (dashboard -> Workers -> policypeek-backend -> Logs).
- If a tool's policy legitimately redirects to another domain, its monthly
  recheck will queue for review instead of auto-updating; add the domain to
  `crossDomainSources.ts` if it is the same company.

## 9. Scrub client IPs from GitHub history (one time, your call)

`bash scripts/scrub-history.sh` builds and verifies a cleaned copy of the history in a temp folder (it never pushes and never touches your working copy) and prints the three commands to finish, including the one force-push. Do it once, with a clean working tree and nothing committed in between, ideally after everything above is committed so it is only done once.
