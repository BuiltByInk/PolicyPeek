# Concurrency validation — 2026-09-06 (Phase 2.5, pre-Phase-3 gate)

Scope: Elliot's Phase 2.5 kickoff, run after Task 3's `review-2026-09-06.md`
(which covered code-diff review but explicitly deferred concurrency testing
as a known gap). This pass builds a real load-test harness against the
actual local `wrangler dev` + local D1 setup — not a unit test with a fake
D1 mock (the existing `*.test.ts` suite uses hand-rolled in-memory fakes,
which can't surface genuine D1/timing races) — and fires real concurrent
HTTP traffic at three specific suspected race points, plus a general
robustness soak test.

**Harness**: `security/loadtest/load_test.mjs` (this commit) +
`security/loadtest/mock_ssrf_server.mjs` (a tiny local dual-stack HTTP
server used only to construct the malicious-redirect SSRF scenario — every
hostname it's reached through resolves to loopback, which `ssrf.ts` itself
correctly blocks, so it's unusable for "safe" synthetic traffic; the
general/rate-limit/domain-race tests use real external tool policy pages
instead, per the kickoff's "mix of real and synthetic" ask).

**Cost**: ~112 real `POST /v1/check` submissions reached extraction
(Haiku calls) across this whole exercise, the rest were correctly rejected
before reaching extraction (SSRF-blocked or rate-capped). Estimated cost
~$0.56 (same per-call estimate basis as Phase 2's cost logging).

## 1. [HIGH] Rate-limit daily cap is trivially bypassed by concurrent requests from the same IP

`isUnderDailyCap` (a `SELECT` against `anonymous_check_log`) and
`recordAnonymousCheck` (an `INSERT` into it) are two separate, non-atomic
D1 calls with real application work in between (domain validation, the
actual SSRF-guarded external fetch). Confirmed empirically, with a fresh
never-before-used synthetic IP each time (so no interference from the
steady-state cap already firing):

- N=2 concurrent, same IP: **2/2 accepted** (should be 1)
- N=5 concurrent, same IP: **5/5 accepted** (should be 1)
- N=10 concurrent, same IP: **10/10 accepted** (should be 1)

The cap does correctly reject a *second, later* request once the first has
actually completed and recorded — the failure is specifically the
check-then-act gap between concurrent requests that all arrive before any
of them has recorded. This isn't a narrow edge case: at every concurrency
level tested, *every* racer got through. Given `rateLimit.ts`'s own
stated purpose ("the actual cost driver (the outbound fetch + Haiku
extraction call per check)"), this completely defeats the one server-side
control standing between anonymous traffic and unbounded LLM-extraction
cost — and it requires no malicious intent, just ordinary concurrent
requests (e.g. a script, a impatient double-click, a shared-IP office/CGNAT
scenario where several people happen to check different sites around the
same moment).

**Proposed fix (not applied — this is exactly the kind of cost-control
policy change that should be a deliberate decision, not a silent patch):**
turn the check from "read-then-decide-then-write" into a single atomic
write attempt. One concrete shape: give `anonymous_check_log` a `UNIQUE`
constraint on `(client_ip, day_bucket)` (a coarser calendar-day bucket
instead of the current rolling-24h window — a real behavior change worth
Elliot's sign-off, not just a mechanical fix) and have `recordAnonymousCheck`
attempt the `INSERT` first, treating a `UNIQUE` constraint violation as
"already used today" — D1/SQLite serializes writes to a single database
internally, so a single atomic INSERT-with-conflict-check closes the race
in a way a separate SELECT-then-INSERT never can. Keeping the exact
rolling-24h semantics while closing the race is possible but more
complex (would need a compare-and-swap-style conditional write D1 doesn't
directly expose) — flagging the tradeoff rather than picking for Elliot.

## 2. [HIGH] Concurrent first-time submissions of a brand-new domain can silently bypass the "verdict changed → always queue for human review" safety gate

This is the more serious of the two findings — it's a verdict-integrity
bug, not just a cost-control gap, and it directly undermines the specific
design guarantee `evaluateAutoPublish` exists to provide (`autoPublish.ts`:
"a verdict that would *change* the existing badge always queues for
review, however clean the facts are").

**Root cause**: `handleCheck` computes `isRecheck` **once, synchronously,
at submission time** (`SELECT 1 FROM tools WHERE domain = ?`), then passes
it *by value* into the deferred `ctx.waitUntil(runExtraction(...))` call.
By the time `runExtraction` actually runs (after a real external fetch +
Haiku round trip — real wall-clock seconds), a *concurrently-submitted
sibling request for the same brand-new domain* may have already published
a tools row. The stale `isRecheck: false` snapshot doesn't reflect this,
so `evaluateAutoPublish`'s `if (opts.isRecheck && verdict !== existingStatus)`
guard is **skipped entirely** — not because the verdict didn't change, but
because the request incorrectly believes there was nothing to compare
against.

**Confirmed empirically** with 5 genuinely-simultaneous first-ever
submissions of `sourcegraph.com` (a domain untouched anywhere in this
session before the test) via `Promise.all`:

| pending_check | isRecheck (stale) | old→new status | outcome |
|---|---|---|---|
| #32 | false (correct — truly first) | null→`compliant` | auto-published (correct, genuinely first) |
| #31 | false (**stale** — #32 had already published) | `compliant`→`compliant` | auto-published (no flip, happened to match) |
| #30 | false (**stale**) | `compliant`→**`compliant_with_caveats`** | **auto-published — a real flip, no queue** |
| #28 | false (**stale**) | `compliant_with_caveats`→**`compliant`** | **auto-published — a real flip, no queue** |
| #29 | true (correct — last, saw the row) | verdict differed from existing | **correctly queued**, not published |

Three of five racers had a stale `isRecheck`; two of those three actually
computed a *different* verdict than what was live at the moment they
committed, and both silently overwrote the public badge with zero human
review — exactly the outcome `evaluateAutoPublish` is supposed to prevent.
The domain's final published verdict (`compliant`) is an artifact of
network/LLM-sampling timing (whichever request happened to commit last),
not a reviewed decision. Only the one request that happened to submit
late enough to see the already-published row was correctly gated.

Separately confirmed this does **not** affect concurrent *rechecks of an
already-published domain* (tested with `kagi.com`, seeded first, then 5
concurrent rechecks): since the domain existed before any of the 5 even
submitted, every one of them correctly computed `isRecheck: true` and the
guard applied consistently (all 5 happened to compute the same verdict as
existing, so no flip occurred in that run, but the *mechanism* for
detecting a flip was live for all of them). **The bug is specifically in
the narrow window between two-or-more truly-concurrent *first-ever*
submissions of the same not-yet-published domain** — a real, plausible
scenario (two users independently checking the same uncatalogued tool
around the same time, or the browser extension's "Check this site" button
clicked more than once) — not an exotic adversarial setup.

**Proposed fix (not applied — this is verdict-methodology-adjacent safety
logic, the kind of change `CLAUDE.md` reserves for Elliot's sign-off even
though the code lives in `check.ts`, not `rules.ts` itself):** don't trust
the submission-time `isRecheck` snapshot for the auto-publish decision.
Inside `runExtraction`, re-fetch the tool's current `compliance_status`
**unconditionally** (not gated on the stale `isRecheck` flag) immediately
before calling `evaluateAutoPublish`, and derive `isRecheck` fresh from
whether that live read found a row — closing the staleness gap entirely,
at the cost of one extra `SELECT` per extraction (negligible). The
`is_recheck` value already stored on the `pending_checks` row (used for
display/audit purposes) can stay as the submission-time snapshot; only the
auto-publish *decision* needs the fresh read.

## 3. [LOW] Redundant, noisy audit-trail entries on concurrent duplicate submissions of the same domain

Distinct from finding #2 — this doesn't corrupt data or bypass any safety
gate, but confirmed as a real side effect of the same underlying
lack-of-coordination: when N concurrent submissions of the same domain
all compute the *same* verdict as whatever's already published (no flip),
`approvePendingCheck`'s explicit `compliance_changelog` insert (`"logged
in addition to whatever the DB trigger already wrote"`) fires once per
approval, **unlike** the DB trigger itself, which correctly no-ops when
`OLD.compliance_status IS NOT NEW.compliance_status` is false. Confirmed
with `kagi.com`: 5 concurrent rechecks, all landing on the same
already-correct verdict, produced 5 near-simultaneous `"auto-published
from pending_check #N"` changelog rows for a status that never actually
changed — noise that could read as "this verdict was re-decided 5 times in
one second" to someone reviewing history later, when nothing was actually
re-decided.

**Proposed fix (small enough to consider applying without escalation, but
holding per the kickoff's instruction to log findings from an unscheduled
pass rather than patch mid-flight):** have `approvePendingCheck` skip its
explicit changelog insert when `existing.compliance_status ===
verdict` (i.e., only log when something actually changed) — mirrors the
trigger's own guard, removing the asymmetry between the two logging paths.

## 4. [INFORMATIONAL] SSRF redirect validation — checked under real concurrency, no races found

Structural review beforehand: `safeFetchText`/`assertSafeUrl` hold no
module-level mutable state — every value (`currentUrl`, the
`AbortController`, the timeout handle) is scoped to that single call's
closure, so there's no shared state for concurrent invocations to race on.
Confirmed empirically, not just assumed: fired concurrent requests at a
locally-controlled server that 302-redirects to `169.254.169.254`
(the classic cloud-metadata bypass target) at N=5, 20, and 50 —

- N=5: 5/5 correctly blocked
- N=20: 20/20 correctly blocked
- N=50: 50/50 correctly blocked

75/75 total, zero races, consistent with the structural read. This
specific probe couldn't also test "safe redirect, correctly followed"
concurrently *in the same batch* as the blocked case, because the only
locally-controlled server available in this sandbox resolves to loopback,
which `ssrf.ts` correctly blocks regardless of what it would redirect to —
a real limitation of this environment, not of the finding; the general
stress test below does exercise real external sites' redirects (several
real tool sites redirect http→https or bare→www) under concurrency as a
partial substitute.

## 5. [INFORMATIONAL] General concurrency soak test — no crashes, no unhandled errors

Fired N=5, 20, and 50 concurrent `POST /v1/check` requests against a
rotating pool of 10 real external tool policy pages (deliberately smaller
than N at the higher tiers, so some domains collide concurrently too,
incidentally adding more same-domain-race coverage at scale). Every
non-202 response was an expected, correctly-classified status (429 from
the already-confirmed rate-limit race's steady-state behavior once an IP
had been used) — zero `500`s, zero `FETCH_ERROR`s, zero entries in
`wrangler dev`'s own log matching `error`/`exception`/`uncaught` beyond the
already-known, already-handled cases. The Worker does not crash or leak
unhandled promise rejections under this load.

## Sign-off recommendation

**Not ready to sign off on this pipeline seeing real concurrent public
traffic in Phase 3 as-is.** Findings #1 and #2 are both real, both `HIGH`,
and both are the kind of thing that gets *worse*, not better, once this is
public (more traffic = a wider, more frequently-hit race window, not a
narrower one). Recommend both be fixed and re-validated with this same
harness before Phase 3 deploy. Finding #3 is minor and can reasonably wait.
Finding #4 (SSRF) is genuinely clean — no blocker there.

## Local D1 state after this exercise

Local dev D1 now contains test artifacts from this run (`cursor.com`,
`sourcegraph.com`, etc.) with verdicts partly shaped by the race itself
(e.g. `sourcegraph.com`'s final `compliant` reflects which racer happened
to commit last, not a reviewed decision) — not real, trustworthy data.
Re-migrated local D1 to a clean empty schema immediately after this
exercise (`wrangler d1 execute --local --file=./schema.sql` after the
tables were dropped) so it doesn't get mistaken for real published data in
a future session. This does not touch the real Cloudflare D1 database at
all — only local dev.
