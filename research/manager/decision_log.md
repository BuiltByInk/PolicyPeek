# Manager decision log

Every decision the manager takes on Elliot's behalf goes here (append only; newest last). Format: what, why, who it affects, how to undo. Elliot can overrule any entry by saying so. Authority and escalation rules: `.claude/agents/manager.md`.

## 2026-09-19

**Note on who wrote these:** the first meeting was run by the main Claude session acting as manager, because the agent definitions in `.claude/agents/` aren't loadable as agent types in this environment (a `research` type was "not found"). The six meeting participants were general-purpose agents told to read their own definition file. Reports are model output, not verified, except where a line here says "checked".

**M1. Pause new sourcing batches.**
Why: 59 tools are sourced but 33 are published, and nothing shows what the last 5 submissions (ids 11-15) produced. Sourcing is ahead of what anyone reviews. Research, marketing and security all named auto-publish accuracy as the main risk.
Affects: research agent, `scripts/batch-submit.mjs` (Elliot runs it anyway). Undo: run the script or ask research for a new batch.

**M2. Commission a fact-check of the 13 auto-published favourable badges.**
Why: `compliant` / `compliant_with_caveats` badges that no human read are the reputational risk before any public marketing. Read-only research report: `research/audits/autopublished_factcheck_2026-09-19.md`.
Affects: research. Undo: nothing to undo (report only).

**M3. Commission an independent security review of the 2026-09-19 backend code.**
Why: the same session wrote and reviewed the fixes; security said it wants a second pass on redirect handling, global cap, alert path and purge cron. Report: `security/review-2026-09-19-independent.md`. Review only; nothing patched by the reviewer.
Affects: security, backend. Undo: n/a.

**M4. Ownership, until Elliot says otherwise** (clarifications, no agent definition edited):
- Extension code and its UI: frontend. Extension permissions and store data-disclosure wording: security reviews, marketing drafts the listing text, Elliot signs off.
- Technical SEO (titles, sitemap, structured data): frontend. Keywords, content plans, page ideas: marketing drafts them as requests to frontend via `DECISIONS_NEEDED.md`; marketing never changes the site.
- Deploy runbook (`DEPLOY_RUNBOOK_*.md`): whoever finishes a milestone that changes deploy steps updates it, and docs checks it at each milestone. Privacy policy text once published: docs keeps it in step with the code; security signs off any change to what is collected.
- `DECISIONS_NEEDED.md`: any agent may append a new dated entry under its own heading; only docs marks entries resolved or superseded.
Why: three agents independently reported these as gaps nobody owns.

**M5. Built two local helper scripts (not deployed, no production access).**
- `scripts/predeploy-check.mjs`: one command before any deploy (backend tests and type-check, frontend build, npm audit, secret-looking strings, no env files tracked, client IPs in tracked dumps). Security asked for a pre-deploy gate. Checked: runs green apart from two warnings (below).
- `scripts/batch-outcomes.mjs`: joins `research/batch_submissions.jsonl` to the live review queue so it shows what ids 11-15 became. **Elliot runs it** (one read-only call to the live admin API with his token); agents don't.
Undo: delete the two files.

**M6. Checked and confirmed two things the meeting raised.**
- `backend/backup.sql` and `backups/policypeek-db-2026-09-06.sql` are tracked in git and contain public IP addresses in `anonymous_check_log` rows (3 and 1 distinct addresses). The 2026-09-06 dump was already on GitHub before today's push; `backend/backup.sql` went up today. The repo is private. Escalated (see meeting notes).
- `backend/.dev.vars` holds a key-shaped value but is untracked, gitignored, and never appeared in git history. Nothing to do unless Elliot knows it was exposed elsewhere.

**M7. Logged the marketing agent's live-site and verdict findings** (it may not edit `DECISIONS_NEEDED.md`, so the manager records them). From `research/marketing/strategy_v2_2026-09-19.md`, live site checked 2026-09-19 via WebFetch: `/privacy/` returns 404 (expected, page not built); `www.getpolicypeek.com` returns HTTP 525 (a Cloudflare SSL handshake error, so the `www` name isn't set up properly, dashboard fix for Elliot); `/about/` has no contact route or last-checked date; tool-page titles contain "GDPR Check", which reads as a legal check; `site:` search shows nothing indexed. Two verdicts to re-check before promotion: **GitHub Copilot** shows Unrated with an unrelated "why" line while GitHub's blog says Free/Pro/Pro+ data is used for training from 2026-04-24 unless opted out (seen in a search summary, page not opened), and **Granola** shows Compliant / "trains on user data: No" beside a quote saying it trains on de-identified data with an opt-out.

**M8. Fact-check result** (`research/audits/autopublished_factcheck_2026-09-19.md`, 13 auto-published favourable badges): 2 SUPPORTED (elevenlabs.io, fireflies.ai); 2 UNSUPPORTED (notion.com: stored clause covers Google Workspace API data only; you.com: covers connected-service data and third-party training only); 6 UNCLEAR (claude.com, cursor.com, grammarly.com, granola.ai, kagi.com, sourcegraph.com); 3 COULD-NOT-VERIFY (openai.com, midjourney.com, perplexity.ai: 403 on every path). Pattern: the pipeline stores one narrow clause and the rule turns it into a broad badge. Caveat from the agent: quotes were relayed by WebFetch's summariser, not raw HTML, so a person must read the flagged pages before anything public is said. No verdict was changed (verdict changes and database writes are Elliot's).

**M9. Independent security review result** (`security/review-2026-09-19-independent.md`, security agent, read-only). Two HIGH findings, both pre-existing gaps the same-session review missed, so under the charter this is a stop and goes to Elliot before more is built: **H1** the shared-domain list is an exact match, so `www.adobe.com` or `gemini.google.com` bypasses it and can auto-publish a product-specific badge (checked in `sharedDomains.ts`; the extension submits the raw tab hostname, so ordinary use hits it; no existing catalog row would change under a subdomain-aware match); **H2** public suffixes and hosting apexes (`co.uk`, `github.io`, `vercel.app`, `pages.dev`, `notion.site`) can be registered from any tenant subdomain, and lookup's parent walk then gives every tenant that verdict (checked in `check.ts` and `lookup.ts`). MEDIUM: one actor with an IPv6 /48 could exhaust the 200/day ceiling; release-on-failure allows uncapped failing fetches (fix needs a migration, or release only for failures before any network call). LOW: alert noise from permanently-stuck rows, IPv6 keying edge cases, midnight and exception slot handling, body read before the cap, display-spoofing characters not stripped. Found fine: no off-domain auto-publish path, IPv4 forms and userinfo tricks blocked, atomic rate-limit insert, alert token never logged, purge cron dispatch, no XSS sinks. Nothing fixed yet; awaiting Elliot.

**M10. Agent permissions widened, on Elliot's instruction (2026-09-19, Telegram): "widen the permission of the agents but ensure anything impactful is run by the manager and escalated to me if needs be."**
Changes (all in `.claude/agents/`, plus the org chart in `CLAUDE.md`):
- backend: `Read, Edit, Write, Bash, Grep, Glob`; scope `backend/` and `scripts/`; may create files (tests, migrations); Bash for tests, type-check, local wrangler (`--local` only). Standing backlog: a real-SQLite test harness and `backend/API.md`.
- frontend: `Read, Edit, Write, Bash, Grep, Glob`; scope `frontend/` and `extension/`; now owns the extension; may add saved smoke tests; never deploys or calls the live API.
- security: `Read, Write, Grep, Glob, Bash`; writes only under `security/` and maintains `scripts/predeploy-check.mjs`; Bash for `npm audit`/tests/read-only git; still reviews rather than writes feature code, and the author of a fix must not be its only reviewer.
- docs: `Read, Edit, Write, Grep, Glob`; scope widened to README, PROGRESS, ARCHITECTURE_NOTES, the runbook and published privacy wording, plus a `DECISIONS_ARCHIVE.md`; splitting `DECISIONS_NEEDED.md` goes through the manager first and deletes nothing.
- research: unchanged tools; now owns recurring fact-checks and tier tracking; batches stay paused (M1).
- marketing: unchanged tools; decisions it wants logged go to `research/marketing/decision_requests.md`.
- manager: `Read, Task, Write` (Write limited to `research/manager/`); now runs an impactful-change inbox at `research/manager/inbox/`.
- **Sign-off rule for everyone:** anything impactful (runtime behaviour, data collected, schema, dependencies, agent tools, public text, irreversible, security posture) gets a note in the inbox first; the manager approves within its authority or escalates to Elliot.
Undo: revert those files in git.

**M11. Security fixes from the independent review, built on Elliot's instruction ("Fix security issues").** Backend tests 116 -> 152, all passing, type-check clean, production `npm audit` clean, `predeploy-check` green apart from the warnings noted there.
- H1: `isKnownSharedDomain` now matches the listed domain and everything under it (an existing test asserted the opposite on a premise the code didn't meet, and was updated with the reason).
- H2: public suffixes and hosting apexes (co.uk, github.io, vercel.app, pages.dev, notion.site ...) are rejected as submitted domains and dropped from lookup's parent walk; a resubmission from a different source host on an existing tool queues instead of silently overwriting. **Dependency added: `tldts`** (bundles the Public Suffix List; the Worker grew from about 44 KiB to about 214 KiB, 62 KiB gzipped, well inside limits). Impactful, approved by the manager as within Elliot's instruction; he can veto.
- Lows: IPv4-mapped IPv6 now maps to the IPv4 identity, unparseable IPs become "unknown", `X-Forwarded-For` is only believed on localhost; the daily slot is released against the bucket it was reserved under and also when an unexpected error is thrown; the request body is limited by bytes, not characters; the shared text cleaner strips zero-width, bidi and C1 characters and truncates by code point; alerts skip pages that can never yield text and clean the failure reason; the cron dispatch is explicit and warns on an unknown schedule; the redirect rule no longer widens a submitted `www.X` to everything under X, treats an https to http downgrade as leaving the site, and the queue shows the real reason; SSRF now also blocks trailing-dot and `*.localhost` hosts, unparseable IPv6 literals, TEST-NET, 6to4, Teredo and SIIT ranges.
- **Deliberately not changed, escalated:** M2 (failed fetches return the daily slot): closing it either takes a database migration or removes the "a failure doesn't burn your check" behaviour Elliot chose on 2026-09-06, so it is his call. M1 (one actor with an IPv6 /48 could exhaust the 200/day ceiling): kept the /64 key, because grouping wider would put unrelated mobile-carrier users in one bucket and block real people; the Cloudflare rate rule on `POST /v1/check` and the per-domain cap idea are the better answers.
- Not done: `npm audit fix` for two dev-only advisories (vitest, nanoid) failed with an npm internal error; the shipped Worker has none.
Undo: revert the backend commit(s); uninstall `tldts`.

**M12. Client IPs in git, on Elliot's instruction ("remove those ips if you can from github").**
Done locally: the two dump files are untracked and gitignored (commit `422aca7`); they stay on disk.
Prepared and verified in a throwaway clone (`scratchpad/repo-clean`, not the real repo): a history rewrite that drops both files from every commit leaves 0 commits touching them, 0 revisions containing any of the 3 addresses, and a byte-identical final tree (110 commits instead of 121). Nothing was pushed.
**Not done: the force-push.** It is on the global deny list and rewrites every commit hash since the first affected commit, so it needs Elliot's explicit yes. Steps once he says yes: commit or stash pending work; run the same `git filter-branch` in the real repo; delete `refs/original`, expire the reflog, `git gc --prune=now`; `git push --force-with-lease origin main` (lease on the last pushed commit). Caveat: GitHub can keep unreferenced objects reachable by commit id for a while after a force-push; full removal may need a GitHub support request or recreating the repository. The repo is private, and if the addresses are only Elliot's own test traffic the real-world risk is small.

**M13. Elliot's "go with recs" (2026-09-19, Telegram) applied to four items of the next-steps report.**
- Item 2, commit locally: done (commits below); nothing pushed, pending the history-scrub decision.
- Item 4, failed fetches keep returning the free daily check: no change; rely on the Cloudflare rate rule for `POST /v1/check` (5 a minute per IP).
- Item 6, `not_ai_tool` boilerplate: built in `rules.ts` (his ruling on a boundary rule). His recommendation had two clauses that conflict if read literally ("require a category a normal SaaS product wouldn't have" and "stop counting cookie/login and payment words toward the two"): dropping cookie words entirely would have broken the hancocyber.com case, which is one comment-style term plus one cookie/login term. Interpretation used: at least two categories must hit AND at least one must be distinctive (comments, embedded media, booking); cookie/login, payments and marketing email can never suffice on their own. Elliot should confirm this reading. 6 new tests; hancocyber.com unchanged.
- Item 8, minimal GitHub check: `.github/workflows/ci.yml` runs `scripts/predeploy-check.mjs` on push and pull request; read-only permissions, no secrets, no deploy. It starts running when this is pushed.
- Item 3 (new domains queue), the demote endpoint and the guardrails: not yet answered, so not built.
- The independent security re-review failed on a usage-limit error the first time and was relaunched.

**Not decided, escalated:** scope changes for four agents, the SQL dumps in git, the `not_ai_tool` boilerplate ruling, and whether brand-new domains may auto-publish a favourable badge. See `meeting_2026-09-19.md`.
