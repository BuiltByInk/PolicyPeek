# Changelog

Running log of what shipped, by session/date, most recent first. Written by
the Docs Agent per `CLAUDE.md`'s Growth Loop ("Docs Agent triggers when any
agent finishes a milestone"). This is a summary of what changed and why —
for the full reasoning behind any entry, follow the pointer into
`DECISIONS_NEEDED.md` or the relevant source file's comments.

This file did not exist before 2026-08-18; it's created here for the first
time and back-filled from `DECISIONS_NEEDED.md`'s history so it starts as a
real record, not an empty log.

---

## 2026-09-17 (extension data-collection disclosure fixed)

`extension/manifest.json`'s Firefox disclosure changed from `required:
["none"]` to `required: ["browsingActivity"]`, per Elliot's call — the
extension does send the active tab's domain to `api.getpolicypeek.com`
on every lookup, and the full tab URL on submission. Category name
confirmed against Mozilla's current docs. Schema doesn't support an
accompanying description field (checked directly), so the plain-
language explanation Elliot drafted is logged in `DECISIONS_NEEDED.md`
for the actual AMO submission form instead. Chrome has no manifest
equivalent at all — that disclosure lives in the Developer Dashboard's
"Privacy practices" tab; a matching one-sentence store-listing draft is
also logged there, not committed (it's listing copy, not code). Icon-
assets blocker for `compliant_with_caveats` is untouched, still open.
Code change only — no submission, no deploy.

## 2026-09-17 (post-launch queue, batch 1)

- **Tool-card sizing fixed** (`frontend/src/pages/tools/index.astro`):
  summary length varies ~64-310 chars across 31/32 tools with no
  clamping, and the one tool with no summary (Zoom AI Companion) skipped
  the `.reason` paragraph entirely — main driver of visibly inconsistent
  card heights across grid rows. Fixed by always rendering the paragraph
  (fallback text for the no-summary case) and clamping it to a fixed
  3-line slot. Grid columns/mobile reflow untouched.
- **Tool submission added to the landing page**
  (`frontend/src/pages/index.astro`): `<SubmitTool />` was only ever used
  on `/tools`, buried behind a nav click. Added as a new section after
  "How a rating gets made," reusing the component bare exactly as it's
  already used elsewhere — no new styling introduced.
- **Landing page copy reviewed, not rewritten** (proposals held pending
  Elliot's sign-off): flagged that "a human reviews it before it's
  published" is the same known-stale claim already open in
  `DECISIONS_NEEDED.md` since Phase 2.5i; also flagged the H1's dangling
  "it" pronoun, the lede's self-referential "this tool" ambiguity, and
  the terse "No Opt-Out" stat label.
- **Extension: fixed two real bugs found during store-submission
  research** — `config.js`/`manifest.json` still pointed at
  `http://localhost:8787` (now `https://api.getpolicypeek.com`, matching
  the Phase 3 launch), and `badgeCopy.js` had no entry at all for
  `compliant_with_caveats` (the actual current status of 2 published
  tools, Bolt.new and HeyGen) — added the missing badge-copy entry and a
  ported `.badge.caveat`/`.badge.double` CSS treatment. Toolbar icon
  assets for this state still don't exist — logged in
  `DECISIONS_NEEDED.md`, needs real icon art, not fixable here.
- **Extension store-submission checklist produced** (sent separately,
  not committed to the repo) — covers Chrome Web Store ($5 one-time fee,
  2FA requirement, listing assets, permissions justification) and
  Firefox AMO (mandatory data-collection manifest disclosure since Nov
  2025 — already present and syntactically correct, but its accuracy is
  now an open question, see `DECISIONS_NEEDED.md`). No submission
  attempted — research and fixes only, per instruction.
- **Several "next up" queue items turned out already done or
  mis-stated** — see the DECISIONS_NEEDED.md-adjacent Telegram report
  for the full correction: the `opt_out_available` schema gap and the
  `tools.json` D1-sync were both completed the same day as launch, and
  the actual current blocker for the 3 remaining pre-ruling tools
  (Ideogram/JetBrains/Luma AI) is the admin token, not the Phase 2.5f
  temp API key.

## 2026-09-17 (Phase 3 launch complete)

`getpolicypeek.com` (Cloudflare Pages) and `api.getpolicypeek.com`
(Worker custom domain) both live and verified in production:

- Frontend deployed via `wrangler pages deploy`, custom domain added in
  the dashboard, working.
- Backend deployed via `wrangler deploy`, resolved to the
  `api.getpolicypeek.com` custom domain correctly on first deploy (the
  route config from the same-day Phase 3 prep entry below).
- Submission pipeline confirmed end-to-end on the live site: an OpenAI
  recheck succeeded, badge rendered. Independently spot-checked from
  this session too — `getpolicypeek.com` renders the real site (32
  tools), `api.getpolicypeek.com/v1/lookup?domain=openai.com` returns a
  correct live `compliant_with_caveats` result for ChatGPT.
- Rate limiting confirmed correct in production: same-IP requests (two
  devices, same WiFi) correctly shared one daily free-tier slot — the
  Phase 2.5b calendar-day bucketing fix holding up under real traffic.

## 2026-09-17 (Phase 3 prep — domain wiring, config only, no deploy)

Target shape decided by Elliot: `getpolicypeek.com` (frontend, Cloudflare
Pages) + `api.getpolicypeek.com` (backend Worker).

- **`backend/wrangler.toml`**: added a Worker Custom Domain route for
  `api.getpolicypeek.com` (`[[routes]]` with `custom_domain = true`, not
  a zone-based `{ pattern, zone_name }` route — the right shape since
  this Worker doesn't own the rest of the zone's DNS records). Verified
  against current Cloudflare docs rather than assumed. Inert until the
  next `wrangler deploy`, not run this pass.
- **`frontend/wrangler.toml`** (new file): added the Pages-project
  counterpart — `pages_build_output_dir = "./dist"`. Named the project
  `policypeek-frontend` for symmetry with `policypeek-backend` (a naming
  choice, not a constraint — trivially renamable later). Per current
  Cloudflare Pages docs, a Pages custom domain is **dashboard-only**,
  not configurable via `wrangler.toml` at all, and can't be set before
  the Pages project exists (i.e. before a first deploy/connection) — so
  `getpolicypeek.com` itself isn't wired here, just documented in a
  comment for whoever deploys.
- **`PUBLIC_API_BASE_URL` — blocked, not wired.** `SubmitTool.astro` is
  the only place in the repo that reads it, and there was no existing
  `.env.production` or Pages-dashboard env var to follow (neither
  existed before this pass). The natural fix — a committed
  `frontend/.env.production` with `PUBLIC_API_BASE_URL=https://api.
  getpolicypeek.com` (not a secret; Astro/Vite's `PUBLIC_` prefix means
  it's meant to land in the client bundle) — is blocked by this
  environment's own permission settings, which refuse writing any
  `.env*`-shaped file regardless of content, the same category of block
  as the admin-token read earlier today. Elliot needs to add that one
  line to `frontend/.env.production` himself (or set it as a Pages
  project env var once the project exists) — nothing else in this repo
  needs to change once that file exists.
- Backend tests (67/67) and frontend build (35 pages) both re-confirmed
  clean with both `wrangler.toml` changes in place; both files also
  validated as syntactically correct TOML directly (not by invoking
  `wrangler`, since even a dry-run touches the `deploy` subcommand this
  pass was told to avoid).

---

## 2026-09-13 (Phase 2.5j)

- **JetBrains AI Assistant / Ideogram / Luma AI opt-out correction —
  computed, blocked on a real-D1 write.** Elliot ruled that none of the
  three tools' quoted opt-out clauses actually govern AI training.
  `computeVerdict()` applied by hand with `opt_out_available: false`
  (needs no D1 access, all three already have `trains_on_user_data:
  true`): all three resolve to `not_compliant`. Persisting the correction
  itself needs a `wrangler d1 execute --remote` write against real D1's
  `pending_checks` rows (#4/#5/#6) — exact `UPDATE` command logged in
  `DECISIONS_NEEDED.md` for Elliot to run himself; does not auto-publish,
  still needs the normal admin-approval step after.
- **Adobe Firefly — new evidence, not resolved.** Strategy (a) (try a
  Firefly/Adobe-specific URL): `helpx.adobe.com` pages 403'd,
  `business.adobe.com`'s existing candidate still times out, but
  `adobe.com/privacy/policy.html` — the exact URL previously diagnosed as
  hanging indefinitely — loaded via a different fetch path and contains
  on-point opt-in/off-by-default language. Not treated as fixed: different
  fetch infra than the backend's actual pipeline, and it's Adobe's
  umbrella privacy policy, not Firefly-specific (a `shared_domain_
  unverified` candidate). Strategy (b) (archive.today) attempted
  separately — the archive.ph domain is unreachable via available tooling
  entirely, unrelated to Adobe's own blocking.
- **Legacy 9-tool backlog closed as "not migrating"**, per Elliot's
  ruling — re-submit fresh via `POST /v1/check` if any get prioritized
  later, rather than reviving 3-4-week-old `extracted_facts`.
- **Two stale `DECISIONS_NEEDED.md` entries annotated** as
  resolved/superseded (the Ideogram/Luma/JetBrains "awaiting Elliot's
  call" entry, now ruled on above; the "9 tools await approval" entry from
  2026-09-01, all 9 resolved by 09-03/09-06).
- **`.claude/agents/`**: added `manager.md` to orchestrate `backend`/
  `frontend`/`security`/`research`/`docs` through a queued backlog run.
  Tightened the other five to minimum-necessary tools (backend →
  Read/Edit/Bash, frontend → Read/Edit, docs → Read/Edit scoped by
  instruction to `CLAUDE.md`/`changelog.md`/`DECISIONS_NEEDED.md`,
  security's `Bash` restricted to the concurrency harness only, research
  keeps its full set since it still authors new `research/*.md` docs).
  Flagged rather than assumed: no `.claude/settings.json` or hooks exist
  in this repo, so deny-list/tool-scope enforcement here is still
  instruction-only, same as `CLAUDE.md`'s existing org-chart model.

## 2026-09-13 (Phase 2.5i)

- **Full read-only state audit** run against the repo (decisions backlog,
  tool-verdict drift, schema gap, temp API key status, rate-limit
  bucketing, deploy readiness, general repo health) — see
  `security/review-2026-09-13-phase2.5i.md` and the corresponding
  `DECISIONS_NEEDED.md` entries for detail.
- **Fixed a live `tools.json` drift**: Bolt.new and HeyGen were approved
  `compliant` → `compliant_with_caveats` in real D1 back in Phase 2.5h,
  but `tools.json` (what the site actually serves) was never regenerated
  after that approval — hand-patched both rows to match.
- **Added the `opt_out_available` column** to `tools` in `backend/
  schema.sql`; wired it through `admin.ts`'s real write paths and
  `autoPublish.ts` so the fact is persisted at publish time instead of
  only living in-memory / in the `pending_checks` JSON blob. Migration +
  backfill SQL written and verified against local D1 fixtures — the real-
  D1 migration itself is still pending Elliot (`wrangler d1 execute
  --remote`, exact command in `DECISIONS_NEEDED.md`).
- **Investigated Copilot's two open data issues** (missing D1 row,
  fact-provenance mismatch) — both turned out already resolved as side
  effects of earlier work; no code fix needed, docs corrected instead.
- **Drafted accurate `/about` + homepage copy** — both currently claim
  100% human review, no longer true since three-tier auto-publish
  shipped. Not shipped; sitting in `DECISIONS_NEEDED.md` awaiting Elliot's
  sign-off.
- **Adobe Firefly**: 3 next strategies surfaced, none picked. **Legacy
  backlog count corrected**: the true count is 9 tools, not the
  documented 17 or an earlier audit's 12 (3 of those 12 turned out to be
  post-Phase-2 rows already published elsewhere).
- **Placeholder production domain swapped**: `policypeek.example` →
  `getpolicypeek.com` in `astro.config.mjs`/`robots.txt` (domain confirmed
  by Elliot), verified in the actual built `sitemap-index.xml`.
- **Scoped security review** of everything touched this pass: 0 High/
  Medium/Low, 7 Informational findings.

## 2026-09-07 (Phase 2.5g – 2.5h)

- **Phase 2.5g: `tools.json` regenerated from real D1.** New script,
  `scripts/generate-tools-json.mjs` (reads every `tools` row via
  `wrangler d1 execute --remote`, converts D1's storage shapes, writes a
  reviewable `tools.generated.json` rather than overwriting the real file
  directly). Found **15** drifted tools, not the 6 originally scoped: 6
  verdict-relevant (ChatGPT, ElevenLabs, Grammarly, Perplexity AI,
  Midjourney, Sourcegraph Cody) and 9 more found only by diffing the full
  fact set (`summary`/`data_retention`/`gdpr_mentioned`, which the prior
  consistency audit never compared) — Claude, Copy.ai, Cursor, GitHub
  Copilot, Gemini, Microsoft Copilot, Replit AI, Stability AI, Zoom AI
  Companion. Elliot approved syncing all 15 in one pass. Verified via
  direct D1 re-query (not just trusted from the diff) and an `astro
  build` + spot-checked HTML output.
- **Phase 2.5h: rechecked the 3 "straightforward" pre-ruling tools before
  approving**, per instruction not to assume. Bolt.new and HeyGen held
  up — explicit, on-point opt-out language confirmed directly against
  their live pages — approved `compliant` → `compliant_with_caveats` via
  the real admin endpoint against real D1. **JetBrains AI Assistant did
  not hold up**: its cited "Section 5, Transparency" opt-out mechanism
  doesn't actually exist on the page — same shape of problem as Ideogram
  and Luma AI. Moved to open rather than approved.

## 2026-09-06 (Phase 2.5f)

- **Cloudflare account's `workers.dev` subdomain confirmed**
  (`elliotink.workers.dev` — already existed, nothing new registered).
  Unblocks `wrangler dev --remote` against real D1 without a deploy.
  Explicit boundary, logged in `CLAUDE.md`: does **not** authorize
  `wrangler deploy`/`wrangler publish`, which stay on the deny list.
- **Sourcegraph Cody published `compliant`** (`trains_on_user_data:
  false`, fresh source URL `cody-notice`) — closes the 2026-09-01/09-03
  fact-discrepancy flag. `tools.json` sync for this one landed the
  following day (Phase 2.5g).
- **5 pre-ruling tools individually rechecked** (Bolt.new, HeyGen,
  Ideogram, JetBrains AI Assistant, Luma AI) — all correctly queued, none
  auto-published, since each one's recomputed verdict
  (`compliant_with_caveats`) differs from its existing `compliant` status
  and `evaluateAutoPublish` queues any recheck that flips a verdict, no
  exception for "just a rules-version correction." Flagged that Ideogram's
  and Luma AI's `opt_out_available: true` facts don't actually look
  training-specific on inspection — a heads-up for whoever approves these,
  not a re-judgment (this held up: both were later corrected to `false` in
  Phase 2.5j above).

---

## 2026-09-06 (Phase 2.5c)

- **Low finding fixed: duplicate compliance_changelog rows on concurrent
  duplicate submissions of the same domain when the verdict doesn't
  change.** Root cause confirmed: the DB trigger
  (`trg_tools_changelog_on_update`) already correctly no-ops on a same-
  value write (`WHERE OLD.compliance_status IS NOT NEW.compliance_status`),
  but both `admin.ts::approvePendingCheck` (human `/approve` path) and
  `admin.ts::tryAutoPublishAtomic` (auto-publish path) fired their own
  explicit `compliance_changelog` INSERT unconditionally after every
  successful write — and Fix #2's compare-and-swap `WHERE id = ? AND
  compliance_status = ?` still matches every racer when the verdict being
  swapped is unchanged, so N concurrent duplicate rechecks each
  legitimately succeed and each logged an identical no-op row. Fix:
  application-level guard on both explicit INSERTs — only log when
  `old_status !== new_status` (or the row is genuinely new) — mirroring the
  trigger's own condition. No trigger change needed. Two new regression
  tests added (`admin.changelogDedup.test.ts`).
- **Harness re-run**: 5 concurrent rechecks of `kagi.com` (same verdict
  each time) now produce zero additional changelog rows (was 5); Fix #1
  (rate-limit, 1/10 accepted) and Fix #2 (new-domain race, exactly 1 tools
  row, no corruption) both re-confirmed unaffected. 65 backend tests pass.
- Applied to local dev D1 only — this is a code-only fix (no schema/trigger
  change), so it ships automatically whenever the backend is deployed;
  nothing further is needed on real D1 for this one.

## 2026-09-06 (Phase 2.5b)

- **Both High concurrency findings fixed and re-validated.** Rate-limit:
  `anonymous_check_log` switched from an `AUTOINCREMENT id` + rolling-24h
  window to a `(client_ip, day_bucket)` PRIMARY KEY, with the check-and-
  record logic replaced by a single atomic `INSERT OR IGNORE`
  (`tryReserveDailySlot`/`releaseDailySlot` in `rateLimit.ts`). **Deliberate
  behavior change:** the cap is now per UTC calendar day, not a rolling 24h
  window — accepted tradeoff, not a side effect (D1/SQLite has no easy
  atomic way to do a rolling-window cap the same way). Verdict-publish:
  `runExtraction` now takes a fresh read of a domain's live status right
  before deciding (not the stale submission-time snapshot), and the actual
  publish write is a compare-and-swap (`admin.ts::tryAutoPublishAtomic`) —
  `INSERT ... ON CONFLICT DO NOTHING` for a new domain, `UPDATE ... WHERE
  id = ? AND compliance_status = ?` for an existing one, checking
  `meta.changes` either way. A lost race now routes to human review
  (`auto_publish_raced` note) instead of risking a silent unreviewed
  verdict flip. Full detail and re-run evidence in `DECISIONS_NEEDED.md`.
- **Harness re-run clean on both fixes**: 10 concurrent same-IP checks now
  correctly cap at 1/10 (was 10/10 through); 5 concurrent first-ever checks
  of a fresh domain produced zero unreviewed flips (losers correctly
  queued for review, not silently published or dropped); general
  N=5/20/50 stress and SSRF (75/75 blocked) both unaffected. 63 backend
  tests pass (`rateLimit.test.ts` rewritten, `check.rateLimit.test.ts`
  updated + one new regression test).
- **Signed off: ready for Phase 3 from a concurrency-safety standpoint.**
  The Low finding (redundant changelog rows on a same-verdict concurrent
  recheck) stays open, cosmetic, out of this fix's scope.
- **Flagged, not done**: the real Cloudflare D1 database still has the old
  `anonymous_check_log` schema — needs the same table recreated (not the
  whole database) before Phase 3 deploy, or the new code's `INSERT OR
  IGNORE` will fail against the missing `day_bucket` column on first use.

## 2026-09-06 (Phase 2.5)

- **Concurrency validation harness built and run** ahead of Phase 3, per
  Elliot's kickoff — see `security/review-2026-09-06-concurrency.md` for
  full findings/evidence, `security/loadtest/` for the reusable harness.
  Found 2 real High-severity concurrency bugs (rate-limit cap bypass;
  verdict-flip safety gate bypass on concurrent first-time domain
  submissions), 1 Low (redundant changelog rows), confirmed SSRF handling
  clean under real concurrent load (75/75 correctly blocked, N=5/20/50).
  Neither High finding fixed yet — both logged in `DECISIONS_NEEDED.md`
  with proposed fixes, pending Elliot's sign-off since both touch
  security/verdict-integrity design decisions, not just bugs. ~112 real
  Haiku calls incurred during testing, ~$0.56 estimated. Local dev D1 reset
  to clean empty schema afterward; real Cloudflare D1 untouched.

## 2026-09-06

- **Real Cloudflare D1 database is live.** Elliot ran `wrangler login` and
  created the database himself; `wrangler.toml`'s `database_id` updated
  from the placeholder to the real uuid, `schema.sql` applied and verified
  directly against the remote database (correct CHECK constraint, both
  triggers present), and all 31 known-good tools migrated over with
  verdicts spot-checked post-import. `wrangler deploy`/`secret`/publish
  remain untouched, still parked for Phase 3.
- **Security review re-pass done**, see `security/review-2026-09-06.md` —
  no new findings; only `check.ts` changed since the last review (already
  reviewed clean when it shipped). One informational carry-forward: Phase
  2's batch was sequential, not concurrent, so SSRF/rate-limit code hasn't
  been proven under real concurrent load yet.
- Phase 2 is now fully closed out: real database live, known-good data
  migrated, security re-passed. Remaining open items are Sourcegraph
  Cody's held decision and the pre-existing legacy pending-review backlog,
  both already logged in `DECISIONS_NEEDED.md`.

## 2026-09-03

- **Elliot reviewed and approved 8 of the 9 tools queued from Phase 2's bulk
  run**, via the real admin endpoint: Copy.ai, GitHub Copilot, Jasper,
  Otter.ai, Replit AI, Runway, Stability AI, Zoom AI Companion. Verdicts
  matched expectations and existing `tools.json` data for all 8. Sourcegraph
  Cody deliberately left queued — see `DECISIONS_NEEDED.md`'s 2026-09-03
  entry, a genuine old-vs-fresh fact disagreement, not a routine approval.
  Local D1 now has 31 of 32 `tools.json` tools.

## 2026-09-01

- **Local dev D1 migrated to the current schema** (adds
  `compliant_with_caveats` to the `tools.compliance_status` CHECK
  constraint, matching `schema.sql`) — preserved all existing rows/ids
  across `tools`, `compliance_changelog`, `pending_checks`, `api_keys`.
  See `DECISIONS_NEEDED.md` for the FK/trigger mechanics.
- **`check.ts`: fixed a silent-failure gap** — the auto-publish step
  (after extraction succeeds) now has its own error handling instead of
  failing as an invisible unhandled `ctx.waitUntil` rejection. Failures
  there now show up in `GET /v1/admin/pending` via `extraction_error`
  instead of disappearing. All 59 backend tests still pass.
- **ChatGPT and ElevenLabs re-verified**: both now correctly
  auto-publish as `compliant_with_caveats` (confirmed via direct D1
  query, `auto_published = 1` on both). Cost: ~$0.0106 for the two
  re-runs (estimate). Running Phase 2 total so far: ~$0.035.
- **Phase 2 batch 2 of 4** (Gemini, GitHub Copilot, Grammarly, Jasper,
  Microsoft Copilot) — no schema errors, confirms the fix holds under
  real traffic including a second `compliant_with_caveats` case
  (Grammarly). Gemini and Microsoft Copilot both correctly landed on
  `shared_domain_unverified` regardless of their extracted facts (the
  override doing its job). GitHub Copilot and Jasper both correctly
  queued for null critical facts. Cost: ~$0.026 for 5 tools. Running
  total: ~$0.061. Note: Grammarly's fresh `compliant_with_caveats`
  result differs from the old hand-curated `tools.json` entry, which
  says plain `compliant` — consistent with the already-known history
  that pre-2026-08-18 entries silently folded this case into `compliant`
  before the bucket existed; not a new bug, logged for awareness when
  D1-vs-tools.json reconciliation happens.
- **Phase 2 batch 3 of 4** (Midjourney, Notion AI, Otter.ai, Perplexity
  AI, Replit AI) — no schema errors. Midjourney and Perplexity AI
  auto-published `compliant_with_caveats` (3rd/4th real-pipeline instance
  of that bucket, same historical note as Grammarly for Perplexity, whose
  old `tools.json` entry says plain `compliant`). Notion AI auto-published
  `compliant` (`trains_on_user_data: false`), matches its existing
  `tools.json` entry. Otter.ai and Replit AI correctly queued for null
  critical facts — Otter.ai's result matches Phase 1's earlier
  direct-script verification of the same page. Cost: ~$0.026 for 5 tools.
  Running total: ~$0.088.
- **Phase 2 batch 4 of 4 (final)** (Runway, Sourcegraph Cody, Stability AI,
  Zoom AI Companion) — no schema errors. All 4 correctly queued for null
  `trains_on_user_data`. Sourcegraph Cody's fresh `null` disagrees with
  `tools.json`'s existing entry (`trains_on_user_data: true`) — a genuine
  fact discrepancy, not just a bucket-folding one; logged in
  `DECISIONS_NEEDED.md` rather than resolved here since it correctly
  queued for human review either way. Zoom's fetched page produced zero
  usable `relevant_clauses` (thin/marketing-only content) — a weak-source
  candidate worth a better URL in a future research pass, not urgent.
  Cost: ~$0.020 for 4 tools. **Phase 2 bulk run total: ~$0.108 across all
  19 tools** (estimates throughout — see the note on why this HTTP path
  can't expose real token usage).
- **Phase 2 bulk run complete**: local D1 now has 23 of 32 `tools.json`
  domains (up from 13 at Phase 2's start) — 10 auto-published this phase
  (Claude, Cursor, ChatGPT, ElevenLabs, Gemini, Grammarly, Microsoft
  Copilot, Midjourney, Notion AI, Perplexity AI), 9 correctly queued for
  Elliot's manual review (Copy.ai, GitHub Copilot, Jasper, Otter.ai,
  Replit AI, Runway, Sourcegraph Cody, Stability AI, Zoom AI Companion) —
  none force-approved, per the human-review-gate rule. The temporary
  local-only `paid`-tier API key used for batch volume has been revoked
  (`api_keys.id = 1`, `revoked = 1`) now that the run is done. Microsoft
  Copilot's D1 `summary` also synced to the specific-reason text (matches
  the website fix from earlier today) now that its row finally exists.
- **Phase 2 bulk pipeline run, batch 1 of ~4, STOPPED after batch 1** —
  found a schema bug (local D1 predates the `compliant_with_caveats`
  CHECK constraint, silently failing any auto-publish that lands on that
  verdict), see `DECISIONS_NEEDED.md`. Cost so far (estimates — this HTTP
  path doesn't expose actual token usage, see the note in
  `DECISIONS_NEEDED.md`): ChatGPT ~$0.0053, Claude ~$0.0023, Copy.ai
  ~$0.0053, Cursor ~$0.0053, ElevenLabs ~$0.0053 — **running total ~$0.024
  for 5 tools**, all Haiku extraction calls (real spend, regardless of
  which then got published vs. stuck). 2 of 5 auto-published (Claude,
  Cursor — both `compliant`), 1 correctly queued for a null fact
  (Copy.ai), 2 silently stuck on the schema bug (ChatGPT, ElevenLabs —
  both would-be `compliant_with_caveats`). Spot-checked Claude and
  Cursor's facts against what's publicly known about each product's
  training policy — both plausible, no red flags.
- **Local dev D1: synced v0's `summary` to match the website's new text**
  (direct two-row-scoped `wrangler d1 execute --local` write, confirmed via
  both a direct query and a live `/v1/lookup` call). Copilot's D1 row
  doesn't exist locally at all, so it couldn't be synced the same way —
  see `DECISIONS_NEEDED.md`.
- **New `ARCHITECTURE_NOTES.md`**: traced every read/write path for
  `frontend/data/tools.json` vs. D1's `tools` table, diffed their content
  for every tool present in both, and laid out the tools.json-vs-D1
  source-of-truth options with a recommendation (D1 as source, `tools.json`
  generated from it) — write-up only, nothing implemented, Elliot's call
  before Phase 2.
- **Behavior change: Microsoft Copilot and v0 now show a specific reason
  for their unverified badge**, instead of the generic "policy text is
  shared across multiple company products" sentence every other
  `shared_domain` tool still shows. No verdict-bucket change —
  `compliance_status` stays `shared_domain_unverified` on both, badge
  stays outlined/amber, `trains_on_user_data`/`data_retention`/
  `gdpr_mentioned` untouched. Fixed by making `frontend/src/pages/tools/
  [domain].astro` and `tools/index.astro` prefer each tool's own
  `summary` field over the hardcoded sentence (falls back to it only if a
  tool has no summary, so every other shared-domain tool renders
  unchanged — verified in the built output). Copilot's `source_urls` also
  updated to the FAQ page that's the actual best current source (was
  pointing at a URL whose content has since drifted — see
  `DECISIONS_NEEDED.md`). Not a breaking change to `/v1/lookup`/
  `/v1/check`: those read D1, not `frontend/data/tools.json`, so this is
  a static-site-only change with zero API surface impact.
- **Live Haiku extraction proven against 3 real policy pages** (not cached
  fixtures) — DeepL (clear GDPR language), Otter.ai (US-only, vague
  retention), Microsoft Copilot (shared-domain edge case). Ran the actual
  production functions (`ssrf.ts::safeFetchText` → `htmlClean.ts` →
  `extraction.ts::extractFacts` against real `claude-haiku-4-5-20251001` →
  `rules.ts::computeVerdict`) directly rather than through `POST /v1/check`,
  to avoid the anonymous daily rate cap (keyed by IP, and local `wrangler
  dev` doesn't set `CF-Connecting-IP`, so all local calls would share one
  bucket) — same code path, same model call, just not the HTTP/DB layer.
  Results:
  - **DeepL**: `trains_on_user_data: true`, `opt_out_available: null`,
    `data_retention` correctly captured the free/Pro split → verdict
    `not_compliant`. Matches the existing published badge and a human read
    of the page.
  - **Otter.ai**: `trains_on_user_data: true`, `data_retention: null`
    (genuinely not stated on the fetched page), `gdpr_mentioned: false` →
    verdict `not_compliant`. Matches the existing published badge.
  - **Microsoft Copilot**: `shared_domain` override correctly forces
    `shared_domain_unverified` regardless of facts — but the facts
    themselves came back **`trains_on_user_data: false`, `opt_out_available:
    true`**, the opposite of what's currently stored in `tools.json`
    (`trains_on_user_data: true`). Investigated, not silently adjusted —
    see `DECISIONS_NEEDED.md`'s 2026-09-01 entry: likely cause is that the
    catalog's stored source URL describes a different Copilot surface
    (consumer chat, 18-month retention) than the `/for-individuals/privacy`
    page actually fetched here (Microsoft 365 app integration, which
    explicitly says it does *not* train foundation models) — a real
    source-URL-specificity problem this `shared_domain` company exposes,
    that the shared-domain override happens to paper over in the public
    badge but shouldn't paper over silently in the underlying data.
  - Confirmed across all three: the raw Haiku JSON never contained
    verdict-like language (no `compliant`/`verdict`/rating field) — only
    the four fact fields plus direct-quote `relevant_clauses`, exactly per
    `extraction.ts`'s schema. Pipeline separation between LLM-facts and
    deterministic-verdict is holding.
  - Did **not** bulk-process the rest of the 21/33-tool catalog and did
    **not** touch `tools.json` — per Phase 1 scope, this was a
    3-tool manual-verification pass only.

- **Firefox extension: fixed a real manifest defect blocking clean installs.**
  `extension/manifest.json` was missing `browser_specific_settings.gecko.id`
  and `data_collection_permissions` — both required by Firefox for MV3
  add-ons (`web-ext lint` flagged this as an `ADDON_ID_REQUIRED` error, not
  a warning). Added `policypeek@builtbyink.com` as the stable id and
  `data_collection_permissions: { required: ["none"] }` (accurate — the
  extension collects nothing). Verified: `web-ext lint` now reports 0
  errors/warnings, and `web-ext run` installs the extension cleanly as a
  temporary add-on in real Firefox 140.13.0esr with no install-time errors.
- Verified backend reachability/CORS independently of the extension:
  `GET /v1/lookup?domain=example.com` against local `wrangler dev` returns
  the expected `404 not_found` with `Access-Control-Allow-Origin: *` and
  the other `cors.ts` headers present — rules out the backend or CORS
  config as the cause of the reported "stuck on Checking…" symptom.
- **Manual click-through verification completed by Elliot, bug confirmed
  fixed**: deepl.com resolved to `not_compliant` (red) instead of hanging;
  kagi.com and you.com resolved to `compliant` (green). Two things that
  looked like new bugs along the way turned out to be correct behavior —
  openai.com/grammarly.com showing "not in catalog" (local dev D1 only has
  13 of 33 published tools seeded) and a "used today's free check" message
  (the real daily rate cap firing) — see `DECISIONS_NEEDED.md` for detail.
  Firefox badge bug is closed; done-criteria (one red + one green case,
  both resolving) met.

---

## 2026-08-18

- **New verdict bucket: `compliant_with_caveats`.** Elliot's ruling: "trains
  on user data by default, but an opt-out exists" is its own bucket, not
  folded into plain `compliant` — GDPR wants opt-in, not opt-out-if-you-
  find-it. Five-bucket verdict system now canonically documented in
  `CLAUDE.md`, implemented in `backend/src/rules.ts::computeVerdict` (doc
  comment), and enforced by `backend/schema.sql`'s `compliance_status`
  CHECK constraint. New teal, double-bordered badge in
  `frontend/src/components/Badge.astro`; methodology explained in
  `frontend/src/pages/about.astro`. Closes a gap that had existed silently
  since milestone 6 (see `DECISIONS_NEEDED.md`).
- **Catalog grew to 31 tools.** Amazon Q Developer (`amazon.com`) and DeepL
  (`deepl.com`) published after Elliot's live review of
  `research/deep_dive_amazonq_speechify_deepl.md`, run through the real
  `POST /v1/admin/pending/:id/approve` endpoint, not a direct DB write.
  Amazon Q Developer kept `shared_domain_unverified` despite a good
  product-specific source (consistent with the existing Gemini/Copilot
  precedent — a dedicated source page doesn't resolve an apex-domain
  identity question). DeepL rated on the free tier, `not_compliant`, with
  an explicit tier-caveat summary sentence noting Pro/API differs.
  Speechify stays queued (id 17), genuinely unresolved: broad-but-not-
  explicit training language, no opt-out found.
- **New cross-domain source allowlist** (`backend/src/crossDomainSources.ts`)
  — a narrow, hand-curated exception to the anti-spoofing domain-lock check
  for products whose real policy legitimately lives on a different,
  verified-owner domain (e.g. Bolt.new's policy is published under
  StackBlitz, its parent company). Bolt.new's own registration corrected
  from `domain: "stackblitz.com"` (wrong — visitors on bolt.new never
  matched) to `domain: "bolt.new"`, sourced from stackblitz.com via the new
  mechanism.
- **Security review pass** (`security/review-2026-08-18.md`): 1 High, 0
  Medium, 2 Low, 6 informational-clean. High finding — `ssrf.ts` didn't
  resolve hostnames via DNS before connecting, so a wildcard-DNS hostname
  (e.g. `*.nip.io`) could sail past the literal-string blocklist and
  resolve straight to the cloud metadata address at `fetch()`-time — fixed
  same day: `ssrf.ts` now does a DNS-over-HTTPS pre-check (Cloudflare's
  resolver) before every connection attempt, initial URL and every redirect
  hop, rejecting on any private/link-local/loopback/metadata answer.
  Documented residual risk: Workers' `fetch()` has no IP-pinning hook, so
  classic low-TTL DNS-rebinding TOCTOU isn't fully closable in this
  runtime — logged as an accepted gap, not silently left open. Also added:
  a lookalike-suffix regression test for the cross-domain allowlist and 8
  new `ssrf.test.ts` cases for the DoH pre-check itself. Full suite: 59/59
  passing.
- **Windsurf's Wayback fallback confirmed live**: a real archive.org
  snapshot was found and correctly queued for human review via
  `sourced_from_archive` (`pending_checks` id 23), not auto-published.
  **Adobe Firefly's diagnosis revised**: no longer believed to be a
  transient IP-based rate-limit (last session's read) — an interleaved
  control test shows archive.org itself specifically throttles/blocks
  `adobe.com` requests while the same outbound IP succeeds against
  Windsurf's URL. Recommendation changed from "retry later" to "needs a
  different strategy, or stays absent from the catalog."
- **Third research batch**: 17 new tools sourced (`research/tool_sources.json`,
  `research/tool_list.md`, summary in `research/third_batch_summary.md`).
  Not yet run through the pipeline. Headline flag: Devin (Cognition) is a
  sharper version of the Bolt.new "disjoint domain" case — one shared
  privacy policy on `cognition.com` explicitly covers both Devin
  (`devin.ai`) and Windsurf (`windsurf.com`), two differently-branded
  products, not yet added to `crossDomainSources.ts`.
- **Docs sync**: `CLAUDE.md` now documents the five verdict buckets
  canonically (previously undocumented there); `DECISIONS_NEEDED.md`
  consolidated (resolved items marked, Adobe Firefly diagnosis corrected,
  third-batch note added); this file created.

## 2026-08-17 (night)

- **Second research batch run through the real pipeline.** 23 sourced-but-
  unpublished tools (21 new + Windsurf + Adobe Firefly) processed via
  `wrangler dev --local` against a fresh local D1 — real fetches, real
  Haiku calls, real verdicts, not simulated.
- **10 tools auto-published**, catalog grew from 19 to 29: Bolt.new,
  Fireflies.ai, Granola, HeyGen, Ideogram, JetBrains AI Assistant, Kagi,
  Luma AI, v0, You.com.
- **11 queued for human review**, each with a stated reason (9 with a
  genuinely null critical fact; Suno hit a new JSON-parse extraction bug,
  not fixed same night; Character.AI's SPA-extraction crash was fixed —
  `extraction.ts` now fails fast with `empty_extracted_text` instead of
  sending garbage to the API — but the tool itself still needs a non-SPA
  source).
- **Domain-identity fixes**: Granola corrected from `docs.granola.ai` to
  `granola.ai` (apex, not the docs subdomain). Bolt.new's disjoint-domain
  issue identified as a new class of gap, left unresolved this session
  (later addressed 2026-08-18 via `crossDomainSources.ts`).
- **Website self-submission shipped**: `SubmitTool.astro` on `/tools`
  posts directly to `POST /v1/check`; required adding CORS support
  (`backend/src/cors.ts`) since the static site and the Worker are
  different origins. Tested end-to-end with a real headless-browser
  submission. Still needs `PUBLIC_API_BASE_URL` wired to a real deploy
  target before it's live — currently shows "Submissions aren't connected
  yet."
- **Three-tier auto-publish went live**: `backend/src/autoPublish.ts`
  (`evaluateAutoPublish`) runs at the end of every extraction. Tier A
  (clean facts, deterministic verdict, no recheck status-flip)
  auto-publishes; Tier B (a null critical fact, or a recheck that would
  flip an existing badge) queues with a stated `queue_reason`; Tier C is
  the monthly cron recheck (`0 3 1 * *` in `wrangler.toml`), never
  auto-overwrites a live badge on a changed verdict. Multi-product apex
  domains (`google.com`, `microsoft.com`, etc.) now auto-flag
  `shared_domain` at submission via a curated list (`sharedDomains.ts`)
  instead of requiring a human to set it by hand.
- **Visual direction shipped**: the "Compliance Label" nutrition-facts/
  energy-rating look (`Layout.astro`, `Badge.astro`) — black keylines,
  condensed headline type, tabular monospace data, bordered disclosure-tag
  badges.
- **Windsurf and Adobe Firefly confirmed structurally blocked** (not a
  transient issue): Windsurf's terms permanently redirect to `devin.ai`
  (confirming the Cognition acquisition), which itself 429s to automated
  traffic broadly; Adobe's policy pages hang indefinitely for non-browser
  clients, consistent with Akamai-style bot detection. Decision: both stay
  absent from the catalog until a fallback source exists; Wayback Machine
  fallback proposed (later built same night, proven live 2026-08-18).

## 2026-08-15

- **ICP and monetization model decided** by Elliot, logged into `CLAUDE.md`'s
  "Business Model & ICP" section: individual/casual checker, not org/vendor
  due-diligence. Free tier stays unlimited on lookups; `POST /v1/check`
  (the catalog growth loop) is explicitly not gated behind premium.
  Premium is depth (sourced clause detail, change monitoring, exportable
  reports), not access.
- **Extraction bug fixed**: raw HTML was being truncated before cleaning,
  so JS-rendered sites' actual policy prose never reached Haiku
  (`backend/src/htmlClean.ts` fix). 18 of 19 affected tools re-run with
  real facts; full table in `research/seed_review_summary.md`.
- **`extraction.ts` JSON parsing hardened**: Haiku sometimes wraps its JSON
  in a markdown fence, or appends trailing text after the closing brace —
  both now handled rather than throwing on `JSON.parse`.
- **21-tool seed batch sourced and run** through the real submission
  pipeline once a working `ANTHROPIC_API_KEY` was in place. `shared_domain`
  applied by hand to the Gemini and Microsoft Copilot pending rows (later
  automated via the curated-list mechanism, 2026-08-17).
- **Anonymous `/v1/check` support + IP-based daily rate cap**
  (`backend/src/rateLimit.ts`, `anonymous_check_log` table): 1 check per
  rolling 24h window per `client_ip` (from Cloudflare's `CF-Connecting-IP`,
  not a spoofable header). Registered `paid`-tier keys exempt.
- **Known open item from this session, resolved 2026-08-18**: `rules.ts`'s
  "trains by default + opt-out available" case had been silently folded
  into `compliant` at milestone 6 — flagged as an undocumented
  interpretation rather than left unexamined; became the
  `compliant_with_caveats` bucket once Elliot ruled on it.

## 2026-08-05 / 2026-08-06

- Project rebuilt from scratch this session — the previous local build was
  never pushed to git and was lost. `CLAUDE.md` created for the first time
  (none existed before).
