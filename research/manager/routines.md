# Weekly routines (approved by Elliot 2026-09-19, not yet scheduled)

Elliot said yes to two weekly routines. They can't be scheduled from here yet:
scheduled cloud agents run in Anthropic's cloud with their own git checkout, and
GitHub isn't connected to Elliot's Claude account (the repo `BuiltByInk/PolicyPeek`
can't be cloned there), and the repo has unpushed work pending the history scrub.
Setting them up is a step for tonight or later: after the scrub push, connect GitHub
(`/web-setup`, or https://claude.ai/connect-github), then ask for `/schedule` and both
are created from the specs below. A cloud routine can't reach Telegram or local files,
so results land as a branch/PR in the repo plus the routine's own page; a local session
relays anything urgent.

Both are read-only against production (no D1, no live API). Neither deploys, edits
code, or contacts anyone. Model default: claude-sonnet-5. Cron is UTC (Europe/London
is UTC+1 until 25 Oct 2026, then UTC+0).

## 1. Weekly badge fact-check sample
- **When:** Sundays 18:00 UTC (`0 18 * * 0`).
- **Why:** the 2026-09-19 audit found only 2 of 13 favourable badges clearly supported.
  This keeps a rotating check going, done by a different agent than the one that sourced
  the tools.
- **Prompt (self-contained):**
  > You are a research fact-checker for PolicyPeek (repo cloned here). Read
  > `.claude/agents/research.md` and `CLAUDE.md` for the rules and the verdict
  > definitions. Facts only, never assign a verdict; cite the source URL and the exact
  > clause; say plainly when a page couldn't be read or was read through a summarising
  > fetch tool; 'unclear' is a valid answer. Pick 5 tools from `frontend/data/tools.json`
  > that have not been checked in `research/audits/` in the last 8 weeks, highest priority
  > first: auto-published favourable verdicts (compliant, compliant_with_caveats), then
  > entries whose `last_checked_at` is oldest or missing, then anything already flagged
  > UNCLEAR or UNSUPPORTED. For each, fetch its stored source URL and decide whether the
  > stored verdict follows from what the page says today (definitions in CLAUDE.md), and
  > note consumer-vs-business splits and whether the source page moved. Write
  > `research/audits/weekly_<YYYY-MM-DD>.md` (under 900 words: a table first, then
  > evidence per tool, then 'needs a human look'). Do not edit any other file. Commit it
  > to a branch named `routine/factcheck-<YYYY-MM-DD>` and open a pull request titled
  > 'Weekly fact-check <date>'. Never post, email or contact anyone.

## 2. Weekly manager check-in
- **When:** Mondays 07:00 UTC (`0 7 * * 1`), after the daily recheck job and the Monday
  overdue alert.
- **Prompt (self-contained):**
  > You are the PolicyPeek manager (repo cloned here). Read `.claude/agents/manager.md`,
  > `CLAUDE.md`, the top of `changelog.md`, `DECISIONS_NEEDED.md` (open items),
  > `research/manager/decision_log.md`, `research/manager/inbox/` and the newest files in
  > `research/audits/` and `security/`. Write `research/manager/weekly_<YYYY-MM-DD>.md`
  > (under 500 words, plain and direct): what changed since last week; what is open and
  > who owns it; anything stale; anything in the inbox needing approval (approve what is
  > within your authority and log it, otherwise escalate); and a short list of next steps
  > with owners, ending with 'Needs Elliot' as one-line questions with a recommendation.
  > Only write files under `research/manager/`. Never edit code, deploy, push to main,
  > or contact anyone. Commit to a branch `routine/manager-<YYYY-MM-DD>` and open a pull
  > request titled 'Manager check-in <date>'.

## Notes
- Both open PRs instead of changing `main`, so Elliot merges what he wants.
- If the fact-check finds a badge it can't support, it says so in the report; demoting is
  Elliot's action (`POST /v1/admin/tools/:id/demote`).
- Pause or delete either at https://claude.ai/code/routines (deleting isn't possible from here).
