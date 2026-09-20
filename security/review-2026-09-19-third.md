# Third security review, 2026-09-19 (read-only)

Scope: commits 1bc3916 to 1a83b04. Backend tests: 21 files, 180 pass. Nothing was fetched or run against a remote system. No HIGH findings.

## MEDIUM

### M-1. Public submissions can write recheck bookkeeping on published tools
- `check.ts:285-290` and `:344` call `markToolAttempt` from the public path. It sets `last_attempt_at` and `last_check_note` (`toolCheckState.ts:18-31`).
- Failing input: anonymous `POST /v1/check`, domain `acme.com`, source `https://acme.com/no-such-page`, for a published acme.com. Facts come back null, so the tool is marked "awaiting review" and `last_attempt_at` becomes now.
- Repeated every 2 days from any IP, the cron never selects the tool (3-day backoff). Its date never advances. The only signal is the Monday alert after 60 days.
- The note can carry an attacker-chosen hostname into the Telegram alert, where it can auto-link.
- Fix: pass a flag so only the cron writes attempt and note.

### M-2. A same-host resubmission refreshes "Last checked" and replaces the source
- `check.ts:282` compares hosts only. `admin.ts:241-256` then overwrites `source_urls`, `summary` and `last_checked_at`, and clears the note.
- Failing input: an anonymous submission for a published domain using a different path on the same host (a community page, an old post) that computes the same verdict. It auto-publishes and stamps today's date.
- The date now attests the wrong page. A human-approved entry becomes `auto_published=1`, and the cron rechecks the new page from then on. The overwrite predates this work.
- Fix: for public submissions on an existing tool, auto-publish only when the submitted URL equals the stored first source URL (fragment and trailing slash normalised). Otherwise queue. The cron is unaffected.

### M-3. One bad row can wedge the daily recheck (`cron.ts:119-121`)
- A tool with `source_urls` of `[]` or NULL hits `continue` before `markToolAttempt`. It stays first in the ordering and takes a slot every day. Five such rows stop all rechecks.
- Malformed JSON, or JSON `null`, throws outside the `try`. The run aborts every day and the Monday alert never fires. This is the old L-F item, now daily.
- Callers cannot create these rows. Hand-inserted or seeded rows can.
- Fix: parse inside the `try`, mark the attempt with a note before continuing, and run the alert independently of the loop.

## LOW

- **L-1. Subrequest budget.** Each hop costs 2 DoH lookups plus the fetch. With up to 5 redirects, a Wayback fallback and an Anthropic call, the worst case is about 20 per tool. Typical is 4 to 7. Five worst-case tools exceed 50 on the free plan. Failure is soft (3-day backoff). Read the first run's log line, and consider 3 per run.
- **L-2. Demote (`admin.ts:329-378`).**
  - `summary` is nulled but the note keeps only status, trains and opt_out. Add a truncated summary to the note.
  - The UPDATE and changelog INSERT are separate. If the INSERT fails, the reason is lost, and a retry returns 409. Use `db.batch`.
  - `data_retention`, `gdpr_mentioned` and `last_checked_at` are kept. The paid lookup shows old retention text, and the page shows a fresh date for an unrated tool. The cron rechecks the tool and queues a flip every 30 days.
  - `handleApprove` has no status check or compare-and-swap. Approving an older extracted row for that domain silently re-promotes. Reject open rows on demote, or have approve refuse unless forced.
- **L-3. Public wording.** `about.astro` says a clear "unrated" result can publish. It cannot: `unrated` arises only from a null critical fact, which queues. Say "unfavourable" only. Backfilled "Last checked" dates equal `updated_at`, not a page read, so consider a footnote.
- **L-4. Migration and runbook.**
  - Runbook 1a says "if not_ai_tool is present, SKIP 1b-1c". That also skips the last-checked migration. Add a separate column check.
  - Deploying the backend first breaks every publish, human approve included, and the cron SELECT. It fails closed.
  - The 09-18 migration and its rollback use a fixed column list. Running either after 09-19 silently drops the three columns. Re-running 09-19 restores them.
  - `DROP COLUMN` works on D1 here. Rollback files sort before their forward file, so `wrangler d1 migrations apply` would run them first. The runbook uses `execute --file`, so it is fine today.
- **L-5. `scrub-history.sh`.** It never touches the real repo: read-only, temp clone, no push, and it refuses a dirty tree.
  - Only `main` is pushed. Other remote branches, tags and `refs/pull/*` keep the old history. Check `git ls-remote origin`.
  - `ips.txt` lands in a default-umask temp directory. Add `umask 077`. Verification is IPv4 only.
  - The push also publishes all unpushed local commits.
- **L-6. `.claude/settings.json`.**
  - `wrangler d1 execute * --remote*` needs a token before `--remote`. So `d1 execute --remote <db>`, `wrangler dev --remote` and `refresh-site.mjs --deploy` are not matched.
  - Not denied: `npm run deploy`, `d1 migrations apply --remote`, `d1 delete`, `time-travel restore`, `wrangler delete`, `rollback`, `versions deploy`. Use `Bash(*wrangler*--remote*)`, `Bash(*wrangler*deploy*)` and `Bash(npm run deploy*)`.
  - `Read(.env)` and `Read(.env.*)` cover the repo root only. Use `**/.env` and `**/.env.*`.
  - The rules apply to sessions started in this repo. The Telegram session runs from `/home/jumpspot`, so it is probably not covered. Copy them to the user-level file.
- **L-7. CI and scripts.**
  - CI uses `pull_request` (not `_target`), `contents: read`, no secrets and no deploy. A fork PR only runs its own code with a read-only token. Pin actions by SHA, and add `timeout-minutes`.
  - `predeploy-check.mjs`: the forbidden-file regex ignores the tracked `.env.production` (public URL only today), and secret patterns miss Cloudflare and admin-token shapes.
  - `batch-outcomes.mjs`: `API_BASE` overrides the target and the token goes with it. It prints stored `extraction_error` raw, so strip control characters.

## Checked and found fine
- **Favourable-first rule.**
  - The decision uses `isRecheck: freshExisting !== null`, read fresh at decision time. The submission-time flag is display only.
  - Concurrent favourable submissions both queue. A favourable run against an unfavourable racer queues either as brand-new or as a flip. The insert uses `ON CONFLICT DO NOTHING`.
  - A pending-only domain counts as brand-new. `www.` and subdomain variants each queue. Case is lowercased, and a trailing dot fails `isValidDomain`.
  - The cron path uses the same logic. Existing rows are not blocked.
  - A demoted tool cannot be re-promoted automatically. Any verdict other than `unrated` is a flip and queues. An `unrated` recheck has a null critical fact and queues too.
- **Demote.** Admin-gated with a timing-safe compare, POST only, ASCII-digit id, and no CORS preflight. The reason is a bound parameter, control-stripped and capped at 300. The compare-and-swap catches concurrent status changes. No injection found.
- **Lookup and frontend.** `lookup.ts` returns the timestamp, not the note. The tool page escapes output and validates the date. The popup uses `textContent` and UTC dates. No injection or spoofing path found.
- **Cron.** `cronJobFor` matches `wrangler.toml`, and the test now reads the file. Selection is parameterised, attempts are stamped before slow work, there is no hot loop, and a failing tool backs off. Only publish paths stamp `last_checked_at`.

## Earlier items
- **Closed:** the residual H2 (`unexpectedFirstSourceHost`), `sourceHostChanged` failing open and ignoring `www.`, and the cron-versus-`wrangler.toml` test.
- **Still open:** M1 and M2 from the first review (escalated), the read-only production query for suffix-domain rows, the wide `*.stackblitz.com` allowance, the retention wording in the privacy text (not re-verified), and `JSON.parse` outside the `try` in the cron (M-3).
- **Not verifiable from the repo:** Cloudflare plan, dashboard rate rules, `ADMIN_TOKEN` strength.
