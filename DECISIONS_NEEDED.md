# Decisions Needed

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

