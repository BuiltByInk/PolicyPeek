# Tonight's checklist (saved 2026-09-19)

Full commands, checks and rollbacks: `DEPLOY_RUNBOOK_2026-09-19.md` (step numbers below match it). Nothing has been deployed yet; everything is committed locally, 9+ commits ahead of GitHub.

## Part 1: essentials (roughly 1.5 to 2 hours)
- [ ] 1. `node scripts/predeploy-check.mjs` (green; a "working tree" warning is fine if you edited anything)
- [ ] 2. Scrub IPs and back everything up: `bash scripts/scrub-history.sh`, then the 3 commands it prints (runbook step 9). One push containing all local commits. Do it first; keep the working tree clean and don't commit in between.
- [ ] 3. Migrations (step 1): check whether `not_ai_tool` is in the CHECK list; back up; apply `2026-09-18-add-not-ai-tool-status.sql` (if not already) THEN `2026-09-19-add-last-checked.sql` (new: adds the last-checked columns; must come before the backend deploy); verify the row count
- [ ] 4. Deploy backend and run the checks (step 3)
- [ ] 5. Approve hancocyber, pending id 10 (step 4); run the read-only suffix check (4a)
- [ ] 6. `ADMIN_TOKEN=... node scripts/batch-outcomes.mjs` to see what ids 11 to 15 became; approve or reject the queued ones (4b). A favourable first result for a new tool now waits in your queue.
- [ ] 7. Read the flagged badge sources (cursor, perplexity, granola, notion, you.com first; then claude, sourcegraph, grammarly; openai and midjourney need a real browser). Demote what you can't stand behind with the new endpoint (4c). Also decide on GitHub Copilot (shows Unrated for the wrong reason). (Ideogram, JetBrains and Luma AI, pending ids 4 to 6, were already published as not_compliant, so nothing to do there.)
- [ ] 8. `node scripts/refresh-site.mjs --deploy` (step 5); check the hancocyber page, the demoted pages, the new "Last checked" row, and the submit form

Minimum for tonight: steps 1 to 5. Steps 6 to 8 matter next because the live site still shows badges we can't fully support (`research/audits/autopublished_factcheck_2026-09-19.md`).

## Part 2: a second session (can be tomorrow)
- [ ] 9. Reload the extension and test it on a site not in the catalog (step 6); choose a real store icon
- [ ] 10. Cloudflare dashboard (step 7): rate rules (`/v1/admin/*` 10/min, `/v1/check` 5/min, `/v1/lookup` 120/min); fix the `www.getpolicypeek.com` 525 error. Anthropic console: monthly spend limit and an alert. Confirm `ADMIN_TOKEN` is long and random, or rotate it.
- [ ] 11. Optional alert bot (step 2): a separate BotFather bot plus 2 secrets
- [ ] 12. Decisions: privacy page inputs (contact email, legal name); whether "Compliant" and the name PolicyPeek are fine; confirm the `not_ai_tool` boilerplate reading (`decision_log.md` M13)
- [ ] 12b. Weekly routines: connect GitHub (`/web-setup` or https://claude.ai/connect-github), then ask me to run `/schedule`; specs in `research/manager/routines.md`
- [ ] 13. Google Search Console exports into `research/marketing/gsc/` (checklist: `research/marketing/strategy_v2_2026-09-19.md`, section 2c)

Everything else Elliot needs to decide is in `research/manager/next_steps_2026-09-19.md`.
