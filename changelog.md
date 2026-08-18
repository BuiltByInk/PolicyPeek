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
