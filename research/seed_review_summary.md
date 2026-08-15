# Seed batch review summary — 21 core tools (updated after extraction fix)

Superseded version of the 2026-08-15 summary, after fixing the HTML-truncation
bug that caused 16/19 all-null extractions. Nothing here has been promoted —
every row is sitting in `pending_checks` waiting on your review via
`/v1/admin/pending`. **Read the two open flags below (shared-domain and the
2 fetch failures) before approving anything.**

## What changed since the first pass

`backend/src/htmlClean.ts` now strips `<head>`/`<script>`/`<style>`/`<svg>`
before truncating raw HTML, instead of after. Re-ran all 18 tools that came
back empty the first time (not Midjourney, which already had real signal).
17/18 got real, substantive facts immediately. The 18th — Claude — was a
different problem: its source URL (`privacy.claude.com`) turned out to be a
nav/index page with no real prose (639 chars of menu text even after
cleaning), not a boilerplate-truncation issue. Swapped to a direct article
(`.../7996868-is-my-data-used-for-model-training`) and it extracted cleanly.
`research/tool_sources.json` updated with a note explaining the swap.

## Full 19 tools — verdicts as they'd compute today

| Tool | Domain | pending_check id | Verdict if approved as-is | Facts (trains / opt-out) |
|---|---|---|---|---|
| ChatGPT | openai.com | 70 | compliant | true / true |
| Claude | claude.com | 88 | compliant | false / true |
| Gemini | google.com | 72 | **shared_domain_unverified** | (override — see below) |
| Microsoft Copilot | microsoft.com | 73 | **shared_domain_unverified** | (override — see below) |
| Perplexity AI | perplexity.ai | 74 | compliant | true / true |
| GitHub Copilot | github.com | 75 | unrated | null / true |
| Cursor | cursor.com | 76 | compliant | false / true |
| Replit AI | replit.com | 77 | unrated | null / true |
| Sourcegraph Cody | sourcegraph.com | 78 | compliant | true / true |
| Midjourney | midjourney.com | 56 | not_compliant | true / null (unchanged from first pass — real signal, not re-run) |
| Stability AI | stability.ai | 79 | unrated | null / true |
| Runway | runway.com | 80 | unrated | null / true |
| ElevenLabs | elevenlabs.io | 81 | compliant | true / true |
| Grammarly | grammarly.com | 82 | compliant | true / true |
| Jasper | jasper.ai | 83 | unrated | null / true |
| Copy.ai | copy.ai | 84 | unrated | null / true |
| Notion AI | notion.com | 85 | compliant | false / true |
| Otter.ai | otter.ai | 86 | not_compliant | true / null |
| Zoom AI Companion | zoom.com | 87 | unrated | null / null |

7 compliant, 2 not_compliant, 6 unrated (now genuinely unclear, not an
extraction artifact), 2 shared_domain_unverified. This is a real spread —
worth a normal editorial read before approving, same as any submission.

## Gemini + Microsoft Copilot: shared_domain flagged, not given a normal verdict

Per your instruction, `pending_checks.shared_domain = 1` is set on both
rows (ids 72, 73). `rules.ts`'s `computeVerdict()` hard-overrides to
`shared_domain_unverified` for these regardless of what the extracted facts
say (both actually extracted real, clear-looking facts — `trains: true,
opt_out: true` — but that's Google's/Microsoft's company-wide stance, not
verified as Gemini/Copilot-specific, so the override is doing its job
correctly here: it's suppressing a normal verdict from data that looks
confident but is scoped wrong).

## The 2 that still don't have a submission: Windsurf, Adobe Firefly

Both logged in `DECISIONS_NEEDED.md` with the current-attempt errors.
Neither looks like a one-off blip:

- **Windsurf**: `fetch_failed_429` on all 3 attempts across two backoff
  windows — reads like the site is blocking the checker's request pattern
  specifically (WAF/bot-detection), not genuine rate-limiting that a longer
  wait fixes.
- **Adobe Firefly**: `"The operation was aborted"` on all 3 attempts,
  including after bumping `FETCH_TIMEOUT_MS` from 8s to 20s in `ssrf.ts` —
  the timeout wasn't the cause, so something else is aborting the request
  (TLS/connection-level issue is my best guess, unconfirmed).

Not retrying a 4th time on either. Both need a real look at the actual
response/connection behavior, not another blind retry.

## What I did NOT do

- No call to the admin promotion endpoint.
- No direct writes to `tools` or `compliance_changelog`.
- No edits to the facts→verdict boundary beyond the shared_domain override
  you explicitly asked for.
