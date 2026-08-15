# Seed batch review summary — 21 core tools

Written by Research Agent, 2026-08-15, after running all sourced tools
through the real `POST /v1/check` pipeline (SSRF-safe fetch → Haiku
extraction → `rules.ts` verdict). Nothing here has been promoted — every
row below is sitting in `pending_checks` waiting on your admin approval via
`/v1/admin/pending`. **Read the headline finding before approving anything.**

## Headline finding: most "unrated" verdicts are an extraction artifact, not a real answer

16 of the 19 tools that made it through extraction came back with **every
single fact `null`** — `trains_on_user_data`, `data_retention`,
`gdpr_mentioned`, `opt_out_available`, all empty. Under `rules.ts` that
computes to `unrated` for all 16. I checked the raw fetched HTML
(`pending_checks.raw_fetch`) for several of them before trusting that
number, and the cause isn't that these companies' policies are silent —
it's that `check.ts` stores the first 20,000 characters of raw HTML and
`extraction.ts` truncates that to 15,000 characters before sending it to
Haiku, and for JS-framework-rendered sites (Next.js, etc. — OpenAI, Cursor,
Replit, and most of the rest of this batch use one), that window is
dominated by `<head>` meta tags, `<link>`/`<script>` chrome, and layout
markup. The actual policy prose either renders client-side or sits much
further down the document than 15–20K characters reaches. Two sample
snippets from `raw_fetch`, both truncated mid-`<head>`:

```
openai.com (id 47): <!DOCTYPE html><html data-dpl-id="dpl_5xfY..." ...
cursor.com (id 53):  <!DOCTYPE html><html data-dpl-id="dpl_ABsA..." ...
```

**Recommendation, not applied by me:** this is a real extraction-pipeline
gap (raw HTML needs to be reduced to body text — or the fetch needs to
target a text-rendering path — before truncation), not a facts/verdict
question, so it's Backend Agent's call, not mine to silently patch. Logged
in `DECISIONS_NEEDED.md`. **I'd hold off approving the 16 all-null rows as
real `unrated` badges until this is fixed and they're re-submitted** —
right now they'd publish a wrong signal (implying "checked, genuinely
unclear" when the honest state is "never actually read").

## The 3 with real signal

| Domain | Verdict | Facts | Confidence |
|---|---|---|---|
| midjourney.com | **not_compliant** | `trains_on_user_data: true`, `opt_out_available: null` | Real prose extracted (see clauses below) — reasonably confident |
| perplexity.ai | unrated | `trains_on_user_data: null`, `gdpr_mentioned: false` | Real prose extracted, but the one fact that drives the verdict (`trains_on_user_data`) still didn't resolve |
| notion.com | unrated | `gdpr_mentioned: true` (from a `window.__tcfapi` consent-manager script snippet, not editorial text) | **Low** — this "fact" came from boilerplate cookie-consent JS on the page, not real prose. Flagging rather than trusting it. |

**Midjourney** (`pending_checks.id = 56`) — relevant_clauses pulled by Haiku:
> "data collected through the process of training Midjourney machine
> learning algorithms"; "Prompts that you provide... and other content...
> that you input into the Services"; "Midjourney may use Personal Data for
> the following purposes: To provide, maintain, and improve our Service"

`trains_on_user_data: true`, no opt-out fact found → `rules.ts` computes
`not_compliant`. This is the one row in the batch I'd actually trust enough
to review normally.

## Full 19 — pending_checks IDs (query via `/v1/admin/pending` or D1 directly)

| Tool | Domain used | pending_check id | Status | Verdict if approved as-is |
|---|---|---|---|---|
| ChatGPT | openai.com | 47 | extracted | unrated (extraction gap, see above) |
| Claude | claude.com | 48 | extracted | unrated (extraction gap) |
| Gemini | google.com | 49 | extracted | unrated (extraction gap + domain concern, see below) |
| Microsoft Copilot | microsoft.com | 50 | extracted | unrated (extraction gap + domain concern, see below) |
| Perplexity AI | perplexity.ai | 51 | extracted | unrated (real prose, fact still unresolved) |
| GitHub Copilot | github.com | 52 | extracted | unrated (extraction gap) |
| Cursor | cursor.com | 53 | extracted | unrated (extraction gap) |
| Replit AI | replit.com | 54 | extracted | unrated (extraction gap) |
| Sourcegraph Cody | sourcegraph.com | 66 | extracted | unrated (extraction gap) |
| Midjourney | midjourney.com | 56 | extracted | **not_compliant** (real signal) |
| Stability AI | stability.ai | 57 | extracted | unrated (extraction gap) |
| Runway | runway.com | 58 | extracted | unrated (extraction gap) |
| ElevenLabs | elevenlabs.io | 59 | extracted | unrated (extraction gap) |
| Grammarly | grammarly.com | 67 | extracted | unrated (extraction gap) |
| Jasper | jasper.ai | 68 | extracted | unrated (extraction gap) |
| Copy.ai | copy.ai | 62 | extracted | unrated (extraction gap) |
| Notion AI | notion.com | 63 | extracted | unrated (low-confidence GDPR fact, see above) |
| Otter.ai | otter.ai | 64 | extracted | unrated (extraction gap) |
| Zoom AI Companion | zoom.com | 69 | extracted | unrated (extraction gap) |

## Domain-identity flag (separate from the extraction gap): Gemini and Microsoft Copilot

`/v1/check` requires `source_url`'s hostname to match or be a subdomain of
the submitted `domain` (the domain-lock fix from the known-bugs list). For
most tools that's clean — the product's own domain hosts its own policy.
For a few, the only public policy content lives on the parent company's
domain rather than a product-specific one, so I registered them under the
domain that technically satisfies the check and actually hosts the source:

- **Gemini** → registered under `google.com`. That's Google's entire
  corporate domain (Search, Gmail, Maps, Ads, everything), not
  Gemini-specific. A `google.com` compliant/non-compliant badge is
  misleading on its face — it can't mean one thing when Google runs dozens
  of unrelated products under it.
- **Microsoft Copilot** → registered under `microsoft.com`, same concern
  (Windows, Office, Xbox, Azure all share that domain), though at least
  Copilot's actual privacy/ToS pages are consistently under
  `microsoft.com` rather than split across unrelated domains.
- Lower-stakes version of the same thing: **ChatGPT** (`openai.com`,
  used to be `chatgpt.com`), **Claude** (`claude.com`, marketing site is
  `claude.ai`), **Notion AI** (`notion.com` vs `notion.so`), **Runway**
  (`runway.com` vs `runwayml.com`) — all single-product-company domain
  pairs, lower conflation risk than Google/Microsoft, but still worth
  knowing the registered domain isn't the product's primary marketing URL.

Not blocking on this — the submissions went through and are sitting in
review either way — but it's a product-identity decision (should
multi-product-company AI features get their own scoped domain key even
though their real policy lives on the shared apex?) that's yours to make
before any of these get promoted, not mine to decide by default.

## The 2 that never got past the fetch step

- **Windsurf** (`windsurf.com`) — failed twice with `fetch_failed_429`
  (rate-limited by the site itself against the SSRF-safe fetch's request).
- **Adobe Firefly** (`adobe.com`) — failed twice with `"The operation was
  aborted"` (timeout in `safeFetchText`).

Both logged in `DECISIONS_NEEDED.md` with the raw errors. Not retried a
third time per the "don't loop on a known failure" instruction — a genuine
fix (longer timeout, different fetch strategy, or just trying again later)
is a backend/infra call, not something to brute-force from here.

## What I did NOT do

- No call to the admin promotion endpoint — everything above is sitting in
  `pending_checks`, awaiting your review same as any other submission.
- No direct writes to `tools` or `compliance_changelog` — every row has a
  real `pending_checks` audit trail from a real `POST /v1/check` call.
- No edits to `rules.ts` or the facts→verdict boundary.
