# Architecture Notes

Durable design write-ups that don't fit `changelog.md` (a record of what
shipped) or `DECISIONS_NEEDED.md` (open questions and their resolutions).
This file is for tracing how the system actually works today when that's
non-obvious from the code alone, and for laying out real design tradeoffs
before Elliot picks a direction. Didn't exist before 2026-09-01.

---

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
