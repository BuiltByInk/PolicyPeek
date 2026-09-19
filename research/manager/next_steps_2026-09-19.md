# Manager report: next steps (2026-09-19)

Written by the manager role (the main Claude session, standing in until the agent definitions can be run as agents). Everything is still local: nothing deployed, nothing pushed. Where a line depends on an agent's report rather than something I checked, it says so.

## Where things stand

- **Built locally and tested:** the `not_ai_tool` verdict and whole-word matching, the 2026-09-19 hardening, the independent-review fixes (both HIGH findings and the cheap lows), the daily IP purge, the stuck-pending alert, submission feedback in the site and extension. Backend tests all pass (152), type-check clean, `node scripts/predeploy-check.mjs` green.
- **Waiting on you to go live:** the database migration check, the backend and site deploys, the extension reload, dashboard settings. Ordered steps, checks and rollbacks: `DEPLOY_RUNBOOK_2026-09-19.md`.
- **Trust problem to fix before any promotion:** of 13 auto-published favourable badges, only 2 are clearly supported (`research/audits/autopublished_factcheck_2026-09-19.md`). Nothing public should say "check the badges" until this is resolved.
- **In flight:** an independent re-review of today's security fixes (`security/review-2026-09-19-rereview.md`, security agent). Findings there stop the line, as usual.

## Decisions I need from you (one line each; my recommendation first)

1. **Scrub the client IPs from GitHub history?** Prepared and verified in a scratch copy (0 commits touch the files, 0 revisions contain the addresses, identical final tree). Needs a force-push (deny list). *Yes if those addresses aren't yours or your test traffic, and if you're fine with every commit hash changing.* GitHub may keep old objects reachable by id for a while; full removal may need a GitHub support request. Hold the next push until you decide, so we push once.
2. **Commit today's work locally now?** (security fixes, permissions, docs, scripts). *Yes; push after decision 1.*
3. **Brand-new domains never auto-publish a favourable badge; they queue for you.** *Yes, before any promotion.* Zero users means the review load is nil today.
4. **Failed fetches keep returning the free daily check (the review's M2)?** *Keep as is;* the Cloudflare rule of 5 requests a minute on `POST /v1/check` bounds the abuse, and changing it either needs a migration or takes away the "a failure doesn't burn your check" behaviour you chose.
5. **The 13 shaky badges: re-approve the unsupported ones as Unrated (or with a better source page) after you read the flagged pages tonight?** *Yes.* Read first: cursor.com, perplexity.ai, granola.ai, notion.com, you.com, then claude.com, sourcegraph.com, grammarly.com; openai.com and midjourney.com need a human with a browser (they block fetching). Also GitHub Copilot: shows Unrated with an unrelated reason, but GitHub says it trains on Free/Pro data from April unless you opt out.
6. **`not_ai_tool` boilerplate follow-up (rules.ts):** options in `DECISIONS_NEEDED.md` item 8. *Require a category a normal SaaS product wouldn't have, and stop counting cookie/login and payment words toward the two.*
7. **Wording:** should the badge word "Compliant" change (it can read as a legal verdict); should "GDPR Check" leave the tool-page titles; is "PolicyPeek" safe as a name (close to PolicyPak and PolicyPeak, and Firefox has "Peek-a-Policy")? *Yes to the title change; think about the other two before the store listing.*
8. **A minimal GitHub check running `predeploy-check`?** *Yes, small.*
9. **Privacy page:** approve wording, supply contact email and legal name, then it can be built and linked. *Do it right after tonight's deploy.*

## Tonight, in order (you, at the computer)

1. `node scripts/predeploy-check.mjs`
2. Runbook steps 1 to 8 (migration check, alert secrets, backend deploy, hanco approve, the suffix check 4a, the batch-outcomes script 4b, site refresh, extension reload, dashboard rules, Anthropic spend limit).
3. Fix `www.getpolicypeek.com` (Cloudflare returns a 525 SSL error for it).
4. Read the flagged badge sources and decide item 5.
5. Give me answers to 1 to 4 so I can finish the local work.

## This week, by agent (each still goes through the sign-off rule)

- **Backend:** real-SQLite test harness for the schema, triggers, CHECKs and migrations; `backend/API.md`; the hosting-domain list review after the re-review; whatever you rule on 3, 4 and 6.
- **Frontend:** privacy page (after you approve wording); contact route and last-checked date on tool pages; title wording; saved smoke tests for the six verdict renderings and escaping; a real extension icon once you choose one.
- **Security:** after the re-review, keep `predeploy-check` current, and an Elliot-run checklist for the dashboard-only settings (rate rules, spend limit, admin token strength).
- **Research:** hold new batches (M1). Re-read the flagged sources with a person's eyes, record tier splits per tool, and re-check ids 11 to 15 once you've run the outcomes script.
- **Docs:** split `DECISIONS_NEEDED.md` into a short "Open" file plus an archive (manager sign-off first; nothing deleted), refresh README, PROGRESS and ARCHITECTURE_NOTES, keep the runbook current.
- **Marketing:** on hold for public actions until the badge audit is resolved, the privacy page is live and the extension is listed. Meanwhile: the Search Console checklist for you (`research/marketing/strategy_v2_2026-09-19.md`, section 2c) and outlines you rewrite yourself.

## What I would not do yet

More sourcing batches, UI polish, analytics of any kind, anything paid, and any public post.
