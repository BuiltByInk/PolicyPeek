# Decisions Needed

## Ran overnight (2026-08-17 night): the second batch went through the real pipeline, 10 now live

Approved go-ahead on all three: pushed the deny-rule relaxation, built the
Wayback fallback, then actually ran the 23 sourced-but-unpublished tools
(21 new batch + Windsurf + Adobe Firefly) through the live check ->
extract -> auto-publish pipeline locally (`wrangler dev --local`, fresh
D1). Not simulated -- real fetches, real Haiku calls, real verdicts.

**Result: 10 auto-published, live in `frontend/data/tools.json` right
now** (catalog is 29 tools, up from 19): Bolt.new, Fireflies.ai, Granola,
HeyGen, Ideogram, JetBrains AI Assistant, Kagi, Luma AI, v0, You.com.

**11 need your review** (queued with a stated reason each, in the local
admin queue -- `cd backend && npm run dev`, then `GET /v1/admin/pending`
with header `X-Admin-Token: local-test-admin-token`):
- 9 came back with a genuinely null critical fact (trains_on_user_data or
  opt_out_available) -- Amazon Q Developer, Tabnine, DeepL, Poe, Speechify,
  Rev, Sudowrite, Wordtune, Synthesia. Correctly queued, not a bug -- the
  source pages just don't clearly answer the question.
- **Suno**: extraction failed on a JSON parse error from Haiku's response
  (`Expected ',' or ']' after array element`) -- same class of flakiness
  as the two bugs already fixed in the seed batch, but a new variant.
  Not fixed tonight (didn't want to hack the parser under time pressure
  without you around to sanity-check) -- worth a look next session.
- **Character.AI**: confirmed the SPA-extraction risk flagged in the
  research summary was real -- `cleanHtmlToText` was stripping the page
  down to nothing, which crashed the Haiku call with an opaque 400. Fixed
  the actual bug (`extraction.ts` now fails fast with an honest
  "empty_extracted_text" reason instead of sending garbage to the API) --
  but Character.AI itself still needs a non-SPA source (their legal pages
  don't render without JS) before it can ever get real facts.

**Windsurf and Adobe Firefly are still unpublished.** Built and unit-tested
the Wayback Machine fallback (`waybackFallback.ts`) as agreed, but
archive.org itself rate-limited this session's outbound IP tonight (429 on
its own availability API, confirmed with a direct test, unrelated to our
code) -- so live verification against these two specific domains is still
outstanding. The fallback is wired in and will trigger automatically next
time either is submitted; no action needed, just flagging that "built" and
"proven against the real target" aren't the same thing yet here.

**Two domain-identity quirks found while running real data, both handled:**
- Granola's sourced privacy policy lives on `docs.granola.ai`, not the
  product's real apex `granola.ai` -- registering it under the subdomain
  would mean a visitor on granola.ai itself never gets a badge match.
  Corrected to `granola.ai`.
- Same underlying issue exists for **Bolt.new**: its privacy policy is
  hosted on `stackblitz.com` (a genuinely different domain, not a
  subdomain), so it's currently registered there -- a visitor on
  `bolt.new` itself won't match. Left as-is rather than hacked around
  (the domain-match validation correctly rejects a source URL that isn't
  actually under the claimed domain) -- this is a new class of gap
  ("one product, disjoint domains") distinct from the shared-domain case,
  worth a real design decision rather than a quick patch.

**Website self-submission is now live** (`SubmitTool.astro` on `/tools`,
posts straight to `POST /v1/check` from the browser -- had to add CORS
support to the backend, `cors.ts`, since the static site and the Worker
are different origins). Tested end-to-end with a real headless-browser
form submission against the local backend, not just eyeballed. **Needs
`PUBLIC_API_BASE_URL` set at build time before this goes live** -- it's
unset in the actual build, so right now the form shows "Submissions
aren't connected yet" rather than silently failing. Wire it to wherever
the Worker ends up deployed.

All of the above is committed and pushed. Full diff is readable, nothing
force-pushed or squashed.

## For review whenever convenient (2026-08-17): 4 items from the second research batch

Full detail in `research/second_batch_summary.md`. Not blocking anything —
sourcing is done, these just need your eyes before/while the batch goes
through the actual check/extraction pipeline:

- **Amazon Q Developer** (`aws.amazon.com`) and **v0** (`vercel.com`) sit on
  shared apex domains — the `shared_domain` heuristic (`sharedDomains.ts`)
  will fire on these automatically once submitted, same as Gemini/Copilot.
  No action needed unless you disagree they're shared.
- **Character.AI** — legal pages are a client-rendered SPA; the fetcher may
  only get an empty shell instead of real policy text on submission. Worth
  a manual look if it comes back `unrated` with null facts.
- **DeepL** and **Suno** have genuinely different data-training answers for
  free vs. paid tiers — not an extraction bug, needs a decision on which
  tier PolicyPeek rates (same "which product line" question as GitHub
  Copilot's Free/Pro vs Business/Enterprise split, already noted in
  `tool_sources.json`).

## Needs a decision before build (2026-08-17): visual direction picked, ship it

Built and shipped the "Compliance Label" direction (see `Layout.astro`,
`Badge.astro`) — literal nutrition-facts/energy-rating look: black
keylines, condensed headline type, tabular monospace data, badges as
bordered disclosure tags instead of soft pills. Chosen over a "Redacted
Dossier" (case-file/redaction motif) and "Audit Terminal" (dark,
monospace-only, log-stream) direction because it's the most literal fit
for an individual/casual-checker product — trust signal doesn't depend on
the visitor being technical, unlike the terminal direction. Flag if it's
wrong; easy to swap since it's all CSS custom properties in one file.

## Confirmed, not just suspected (2026-08-17): Windsurf and Adobe Firefly are blocked by vendor-side anti-bot, not fixable by retrying

Elliot asked for a real look instead of another blind retry. Tested both live, with two different fetchers (not just PolicyPeek's checker), to isolate whether it was our request pattern specifically or something broader:

- **Windsurf**: `windsurf.com/terms-of-service-individual` now permanently redirects (308) to `devin.ai/windsurf/terms-of-service-individual` — Windsurf's terms moved off their own domain entirely. Side finding: this confirms Windsurf was acquired by **Cognition** (maker of Devin), not OpenAI as an earlier research note said — corrected in `tool_sources.json`. The redirect target itself (`devin.ai`) returned `429` to a *second, unrelated* fetcher in addition to our checker, so this isn't our user-agent being singled out — devin.ai is broadly rate-limiting/blocking automated traffic at the edge (Cloudflare bot-fight-mode is the likely mechanism).
- **Adobe Firefly**: `adobe.com/privacy/policy.html` and `business.adobe.com` both hang with zero response — no block page, nothing — past 60 seconds, confirmed with two different fetchers. Not a slow page: this reads as Akamai-style bot detection stalling the connection for non-browser clients rather than a clean 403. Raising `FETCH_TIMEOUT_MS` further (already bumped 8s→20s) cannot fix an indefinite hang.

**Decision, not further diagnosis needed:** treat both as structurally unreachable to any automated fetcher, not a bug in `safeFetchText`. Neither has a `tools` row — they stay absent from the catalog (openly "not yet checked," not silently missing or mis-rated) until a fallback source exists. Proposed fallback, not yet built: pull the last Wayback Machine snapshot for cases like this, and mark the resulting `tools` row's summary as "sourced from archive, not live" rather than presenting it as a live check. Flagging the fallback as a real backlog item, not implementing it speculatively.

## Resolved (2026-08-17): three-tier auto-publish is live

`autoPublish.ts` (`evaluateAutoPublish`) now runs automatically at the end of every extraction (`check.ts::runExtraction`), including cron rechecks. Tier A (clean facts, deterministic verdict, and — for a recheck — no status flip) auto-publishes via `admin.ts::approvePendingCheck({ autoPublished: true })`, logged to `compliance_changelog` and flagged `tools.auto_published = 1`. Tier B (a critical fact came back null, or a recheck's verdict would flip the existing badge) stays in the pending queue; `handleListPending` now returns a `queue_reason` computed by the same `evaluateAutoPublish` call, so admin approval is confirming a specific stated reason instead of re-deriving it. Tier C is `cron.ts::runMonthlyRecheck`, wired to a new `0 3 1 * *` cron trigger in `wrangler.toml` — re-fetches every published tool monthly and runs it through the identical pipeline; unchanged verdicts silently re-confirm, changed ones always land in the human queue via the tier-B path, never auto-overwrite a live badge.

Multi-product apex domains (`google.com`, `microsoft.com`, etc.) are now auto-flagged `shared_domain` at submission time via a curated list in `sharedDomains.ts`, rather than requiring a human to set the flag by hand per `DECISIONS_NEEDED.md`'s "domain identity" note below — that note's underlying question (apex domain + name identifier, `shared_domain_unverified` as the honest verdict) is Elliot's confirmed answer, so this is wiring the decision into the pipeline, not making a new one.

Needs a schema refresh on any existing local D1 (`tools.auto_published` is a new column, `IF NOT EXISTS` won't add it to an already-created local table) — `npm run db:migrate:local` after dropping the local D1 file, since nothing is deployed and there's no real data yet.

## Flagging, not blocking (2026-08-15): IP-based identity for the anonymous daily check cap

`POST /v1/check` now accepts anonymous callers (no more hard 401 on a
missing/invalid API key — degrades to free tier exactly like
`GET /v1/lookup` already did) and enforces a real server-side cap: 1
check per rolling 24h window, keyed by `client_ip`
(`backend/src/rateLimit.ts`, `anonymous_check_log` table). Registered
`paid`-tier keys are exempt entirely, matching existing tiering.

I picked IP over a client-generated anonymous token (the other option
raised in the extension scope doc) because it works for *any* caller —
extension, curl, a future web client — without needing coordinated
client-side state, and because a token stored in `chrome.storage` is
trivially reset (uninstall/reinstall, clear storage), which defeats the
point of a *server-side authoritative* cap. IP isn't perfect either,
flagging the tradeoff rather than pretending it's fully solved:

- **Shared IPs under-count generosity, not over-grant it.** Office
  WiFi, university networks, and CGNAT (common on mobile carriers) put
  many unrelated people behind one public IP, so they'll collectively
  exhaust one shared 1/day quota. This is a false-positive-throttle
  problem (annoys legitimate users), not an abuse problem — the cap
  fails toward being too strict for those users, not too loose against
  abusers, which is the safer direction for a cost control but still a
  real UX cost at scale.
- **VPN/proxy exit nodes are the opposite failure mode**: many distinct
  people can appear to come from the same handful of VPN provider IPs,
  same under-counting effect as CGNAT.
- **Not spoofable from outside**, unlike `X-Forwarded-For` — Cloudflare
  sets `CF-Connecting-IP` at the edge from the real TCP connection, so
  this doesn't create a bypass vector the way trusting a client header
  would.

Not blocking anything today (zero real users), but worth revisiting once
usage exists — either a hybrid (IP + optional client token, taking
whichever is more permissive) or accepting the shared-IP friction as a
deliberate trade for real enforcement. Your call if/when it matters.

## Resolved (2026-08-15): ICP + monetization model

Elliot's call, logged verbatim into `CLAUDE.md`'s new "Business Model &
ICP" section so every agent reads it at session start instead of re-asking:

- ICP is the individual/casual checker, not org/vendor due-diligence —
  zero users yet, this is a bottom-up bet. Don't architect for org/team
  usage now.
- Free tier stays unlimited on lookups, and `POST /v1/check` (the catalog
  growth loop) is explicitly *not* to be gated behind premium. Checked
  `backend/src/auth.ts::requireApiKey` — it already only requires *a*
  valid key, not a paid one, so no backend change was needed to match
  this.
- Premium is depth (sourced clause detail, change monitoring, exportable
  reports, maybe instant-vs.-published-queue), not access.
- Still open, explicitly not decided: whether the 100%-manual review gate
  moves to auto-publish-on-high-confidence later. Don't build toward that
  without a separate explicit go-ahead — checked into `CLAUDE.md`'s
  "Still Manual" list as its own open item.

## Resolved (2026-08-15): extraction gap fixed, 18/19 re-run with real facts

The HTML-truncation bug (raw HTML truncated before cleaning, so JS-rendered
sites' policy prose never reached Haiku) is fixed —
`backend/src/htmlClean.ts`. Re-ran the 18 affected tools; 17 got real facts
immediately, Claude needed a source-URL swap (its original URL was a nav
portal, not policy text — see `research/tool_sources.json`'s note). Full
verdict table in `research/seed_review_summary.md`. Also applied
`shared_domain = 1` to the Gemini and Microsoft Copilot pending rows per
your instruction — they now compute `shared_domain_unverified` instead of
a normal verdict.

## Still open: 2 of 21 seed tools have no working submission (2026-08-15, 3rd attempt)

- **Windsurf** (`windsurf.com`): `fetch_failed_429` on all 3 attempts,
  including one after a longer backoff. Doesn't look like transient
  rate-limiting — reads more like the site's WAF blocking the checker's
  request pattern specifically. Worth a manual look at what
  `safeFetchText`'s request actually looks like from Windsurf's side
  (user-agent, TLS fingerprint) rather than another automated retry.
- **Adobe Firefly** (`adobe.com`): `"The operation was aborted"` on all 3
  attempts, including after bumping `FETCH_TIMEOUT_MS` 8s → 20s in
  `ssrf.ts`. Timeout wasn't the cause, so the abort is coming from
  somewhere else (TLS handshake, connection reset — unconfirmed). Not
  retrying further without knowing why it's actually aborting.

---


## Fixed with your go-ahead: extraction.ts JSON parsing (2026-08-15)

Running the 21-tool seed batch (once the API key blocker above was
resolved) hit two real bugs in `backend/src/extraction.ts`, both about
`JSON.parse(text)` being too strict for how Haiku actually responds. You
approved both fixes live, so they're applied, not just proposed:

1. Haiku sometimes wraps its JSON in a ` ```json ... ``` ` fence despite the
   system prompt saying not to — `JSON.parse` threw on the leading
   backtick on all 19 submissions before this fix.
2. After the fence fix, 4 of 19 still failed with "Unexpected
   non-whitespace character after JSON" — Haiku occasionally appends
   trailing text after the closing `}`. Fixed by extracting the substring
   between the first `{` and last `}` before parsing, rather than trusting
   the response to be pure JSON.

Both are parsing-robustness changes only — nothing about the facts schema
or the facts→verdict boundary changed. `npm test` (11 tests) still passes.
Flagging here per the charter's "log it rather than just doing it"
instruction, since `extraction.ts` is Backend Agent's file, not mine.

---

## New blocker: raw HTML truncation loses the actual policy text on JS-rendered sites (2026-08-15)

See `research/seed_review_summary.md` for the full writeup — headline: 16
of 19 seed-batch extractions came back with every fact `null`, and it's
because `raw_fetch` (20K chars stored, 15K sent to Haiku) is dominated by
`<head>`/script/CSS boilerplate on JS-framework sites (OpenAI, Cursor,
Replit, and most of the rest use Next.js or similar), not real policy
prose. Confirmed by reading `raw_fetch` directly, not assumed. This makes
most of the current "unrated" verdicts in the pending queue misleading —
they read as "checked, genuinely unclear" but are actually "never saw real
content." Did not attempt a fix myself (needs a real design decision about
how to get to rendered body text — strip tags, target a different fetch
strategy, or something else — squarely a Backend Agent architecture call,
bigger than the two one-line JSON-parsing fixes above).

## New blocker: 2 of 21 seed tools failed at the fetch step, not retried further

- **Windsurf** (`windsurf.com`): `fetch_failed_429` on both attempts.
- **Adobe Firefly** (`adobe.com`): `"The operation was aborted"` (timeout)
  on both attempts.

Not retried a third time — see `research/seed_review_summary.md`.

---

## New decision needed: domain identity for multi-product-company AI features

Gemini and Microsoft Copilot's only public policy content lives on their
parent company's shared apex domain (`google.com`, `microsoft.com`) rather
than a product-specific one. I registered them there since it's what
actually satisfies the domain-lock check and hosts the real source, but a
`google.com` compliant/non-compliant badge conflates Gemini with every
other unrelated Google product. Lower-stakes version of the same question
for ChatGPT/openai.com, Claude/claude.com, Notion AI/notion.com, and
Runway/runway.com (all single-product companies, just not the domain their
marketing site uses). Full detail in `research/seed_review_summary.md`.
Not blocking — submissions went through either way — but the identity
scheme itself is your call before any of these get promoted.

---


## Blocked: no ANTHROPIC_API_KEY, so the 21-tool seed batch stops after research (2026-08-15)

Task: run all 21 seed tools through the real `POST /v1/check` submission
pipeline (SSRF-safe fetch → Haiku extraction → `rules.ts` verdict → pending
review), same as any external submission. Research is done — see the
"Resolved" note below. Running the pipeline is not.

**Root cause, confirmed with a real test, not assumed:** `backend/.dev.vars`
has no `ANTHROPIC_API_KEY`. I seeded a local test API key
(`api_keys.label = 'local-research-agent-seed-test-key'`, paid tier,
local D1 only — not a real secret, mirrors the existing
`local-test-admin-token` pattern) and submitted one real tool
(Grammarly, `pending_checks.id = 8`) through the live endpoint to see the
actual failure rather than guess it:

```
POST /v1/check -> 202 Accepted, pending_check_id 8
pending_checks.status: still "pending" (never reaches "extracted")
pending_checks.extraction_error: "ANTHROPIC_API_KEY not configured"
```

This is the exact same error `extraction.ts` was already known to produce
per the earlier project notes — this just confirms it's still true today,
with a real request/response instead of reading the code and assuming.

**Why I stopped instead of running the other 20 anyway:** every one of them
would hit this identical error — it's a missing credential, not a per-tool
extraction problem. Looping through 20 more identical, known-in-advance
failures would just be noise in `pending_checks` and in this file, which
runs against the spirit of "don't silently retry in a loop."

**What I need from you:** a real `ANTHROPIC_API_KEY` (a low-spend/test key
is fine) to add to `backend/.dev.vars` — it's gitignored, stays local, never
touches production. Once it's there, I can pick up exactly where this left
off: resubmit Grammarly plus the other 20 tools from
`research/tool_sources.json` through the same pipeline, then write
`research/seed_review_summary.md` for your review — no auto-publish, same
as originally scoped.

The stray `pending_checks` row (id 8, Grammarly, stuck on the missing key)
is left in place as evidence rather than deleted — it'll just get
re-processed (or you can reject it) once extraction works.

---


Written autonomously overnight (2026-08-05/06) while you were offline. Nothing below was acted on — each item either needs your judgment or touches something explicitly off-limits (deploy, admin token, pricing, verdict logic, deleting data). Review top to bottom; items are roughly in the order they came up.

## Resolved (2026-08-15): the 21-tool list now exists

You confirmed via direct task instructions that the list should be created
from scratch, not recovered. It's done: `research/tool_list.md` (the 21
tools + categories) and `research/tool_sources.json` (privacy/ToS/DPA/trust
URLs for each, sourced live via WebSearch this session, not guessed). See
the new blocker immediately below for why they haven't gone through the
real submission pipeline yet.

---

## Blocked: couldn't find the "21 preloaded AI tools" list (superseded, kept for history)

The research task asked me to verify privacy-policy/ToS/DPA/security URLs for "the ~21 preloaded AI tools the extension ships with." I searched the whole repo (including git history) and found:
- No browser extension code anywhere in this repo.
- No list of ~21 tools, anywhere — not in the repo, not in any config, not in `.claude/agents/`.
- No `memory/CLAUDE.md` (referenced in the backend-polish task) — no `CLAUDE.md` existed at all until I created one tonight (see Docs section below).

This project was rebuilt from scratch this session (you said as much when we started: "the previous local build was lost — never pushed to git"). It's possible the tool list and/or extension code only ever existed on the old machine and genuinely didn't make it into any session artifact I have access to, or it's possible it lives somewhere I didn't think to check (a doc in your Downloads folder again? a different repo?).

I did not invent a list of tools or guess plausible-sounding privacy policy URLs to fill this gap — that would be exactly the "rounding ambiguity into confidence" thing the research agent's own instructions tell it not to do. **What I need from you:** either point me at the actual list, or confirm it needs to be created from scratch (in which case that's a product decision — which 21 tools — not a research task).

---

## rules.ts has a gap the original spec never covered — I filled it in myself back at milestone 6, flagging it now instead of changing it further

`memory/CLAUDE.md` doesn't exist (see Docs section below — I created a root-level `CLAUDE.md` tonight to start closing that gap), so I reviewed `backend/src/rules.ts` against `schema.sql` and the original verdict spec you gave me instead. Found one real gap, not a bug exactly, but a decision that was made silently and should be visible to you:

Your original three-bucket definition was:
> not_compliant = training on user data by default with no opt-out; compliant = opt-in or off-by-default; unrated = genuinely unclear

That leaves one case undefined: **trains on user data by default, but an opt-out exists.** It's not "opt-in," it's not "off-by-default," and it's not "no opt-out" either — it's simply not covered by the literal wording of any of the three buckets.

Current code (`rules.ts`):
```ts
if (facts.trains_on_user_data === null) return "unrated";
if (facts.trains_on_user_data === false) return "compliant";
return facts.opt_out_available === true ? "compliant" : "not_compliant";
```
The last line means I decided, at milestone 6, that "trains by default + opt-out available" counts as **compliant**. That's a reasonable reading, but it's an interpretation I made silently in the moment, not something you explicitly signed off on — and per tonight's instructions, changing verdict logic is your call, not mine, so I'm surfacing it rather than touching it further. If you'd rather that case be `unrated` (opt-out existing doesn't necessarily mean it's easy to find or use) or its own thing, that's a one-line change in `computeVerdict()`.

---

## Placeholder production domain in astro.config.mjs

SEO work (sitemap.xml, canonical URLs, OpenGraph URLs) needs an absolute domain to generate against. I used `https://policypeek.example` as a placeholder in `frontend/astro.config.mjs` (`site:`) and `frontend/public/robots.txt` (`Sitemap:` line) — both need the real production domain swapped in before this ever goes live. Not attempting to guess it since that's your call, and it's adjacent to the deploy decisions you told me not to touch.

---

## FYI, not urgent: light competitive scan

Three tools doing roughly what PolicyPeek does, for context when you get to pricing (not asking you to decide anything now):

- **[ToS;DR](https://tosdr.org/en)** — the closest architectural match: a pre-built, curated database you look up a service in and get a letter grade (A–E) plus per-clause reasoning. Free, donation-funded, volunteer/peer-reviewed instead of an admin-approval pipeline. This is the "prior art" for PolicyPeek's whole model.
- **[Termzy AI](https://www.termzyai.com/)** — Chrome extension, analyzes whatever policy page you're currently on in real time (not a pre-built database), scores across 4 dimensions. Free, fully client-side (no server, no stored data) — different trust model than PolicyPeek's server+D1 approach.
- **[TrustScan](https://trustscan.dev/)** — web tool, paste a URL or policy text, get a plain-English summary. Free, no account, explicitly "no premium tiers," processing stays in-browser.

Pattern worth noting: everything I found in this exact niche is free (no paywall on the core lookup/analysis). The paid enterprise-compliance tools that came up in search (Centraleyes, Credo AI, Termly) are a different market — they're for companies proving *their own* regulatory compliance (EU AI Act, GDPR-doc-generation), not for end users checking whether *someone else's* tool trains on their data. Not sure if that changes your pricing thinking, just flagging it since it's the first real market signal we have.

