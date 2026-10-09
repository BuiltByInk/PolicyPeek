# Decisions Needed

This file holds decisions and questions that are still open or waiting on Elliot. Any agent may append a new dated entry under its own heading; only the docs agent marks entries resolved or superseded. Settled entries move, unchanged, to `DECISIONS_ARCHIVE.md` (split done 2026-09-19, manager decision M10). Status notes marked "docs agent" were checked against the code and `changelog.md` on 2026-09-19; production state is never read by the docs agent, so anything that depends on it is marked "verify".

## What is open right now

Rows 1-7 are items still waiting on Elliot (some from the archived 2026-09-19 security-audit entry, some tracked elsewhere). Rows 8-16 are the entries kept in full below.

| # | Item | Date | Status | Needed from Elliot |
|---|---|---|---|---|
| 1 | Deploy everything built 2026-09-18/19 (backend, site, extension), including the unverified production migration (audit item 5) and the hancocyber.com re-approve | 2026-09-19 | Built and tested locally, not deployed. Unverified whether `migrations/2026-09-18-add-not-ai-tool-status.sql` has run on production D1 (runbook step 1a checks it read-only). | Run `DEPLOY_RUNBOOK_2026-09-19.md` in order (steps 1, 3, 4, 5, 6). |
| 2 | Anthropic monthly spend limit and email usage alert (audit item 2) | 2026-09-19 | Dashboard setting, not in the repo. Backstop for the 200-checks-a-day ceiling. | Set it in the Anthropic console (runbook step 7). |
| 3 | Cloudflare rate-limit rules and `ADMIN_TOKEN` strength (audit item 4) | 2026-09-19 | Dashboard rules, not in the repo. | Add the three rules and confirm the token is long and random (runbook step 7). |
| 4 | Stuck-pending alert secrets (audit item 6) | 2026-09-19 | Code built, silent until `ALERT_BOT_TOKEN` and `ALERT_CHAT_ID` exist. Optional. | Create a separate alert bot and set the two secrets (runbook step 2), or skip. |
| 5 | `not_ai_tool` boilerplate rule: confirm the reading used (audit item 8) | 2026-09-19 | Built in `rules.ts`; the manager log (M13) says Elliot should confirm the interpretation. | Confirm or correct. Until then, look at the computed verdict before approving any `not_ai_tool` row. |
| 6 | Marketing questions (audit item 9) | 2026-09-19 | Badge word "Compliant" can read as a legal verdict; name close to PolicyPak/PolicyPeak; spot-check auto-published badges before anything public; single badges can hide tier splits. Fact-check result: `research/audits/autopublished_factcheck_2026-09-19.md`; demote steps: runbook 4c. | Decide; list is in `research/marketing_strategy_2026-09-19.md` section 6. |
| 7 | Scrub client IPs from GitHub history | 2026-09-19 | Tracked in `research/manager/decision_log.md` (M12, M15) and runbook step 9, not as an entry here. Scrub script prepared; nothing pushed. | Explicit yes, then run the final force-push himself. |
| 8 | JetBrains / Ideogram / Luma AI opt-out correction (plus the two entries that carry its evidence) | 2026-09-13 | Possibly stale, verify. Changelog says approved as `not_compliant` on 2026-09-18; runbook 4b says the write never happened. | Run the read-only check in the status note; if all three are `not_compliant`, tell the docs agent to archive them. |
| 9 | Adobe Firefly: new evidence | 2026-09-13 | Open. Not in the catalog; held in `scripts/batch-submit.mjs`. | Pick a strategy (see entry 10). |
| 10 | Adobe Firefly: still unreachable, strategy pick | 2026-09-13 | Open. Three options listed, none chosen. | Choose: different URL, different archive, or accept the gap. |
| 11 | Domain/policy-link validator too strict on subdomains | 2026-09-17 | [x] **Fixed in source, verified by tests 2026-10-09** (`backend/src/submitFlow.e2e.test.ts`, `frontend/tests/submit-form.test.mjs`): `midjourney.com` + a `docs.midjourney.com` link is accepted end to end. Such a first submission always waits for a person (security review H2), it never auto-publishes. Live site still unverified. The reverse case (website `app.acme.com`, policy on `acme.com`) is still refused: see row 16, item 2. | After the next deploy, submit a subdomain policy link once on the live site; then the docs agent can archive this. |
| 12 | `/about` claim vs. practice; third batch paused | 2026-08-18 | Possibly stale, verify. Copy fixed in source, live site depends on deploy; batches paused by M1. | Say whether the review-integrity fix is enough to reconsider the pause. |
| 13 | Third research batch, 17 tools, not piped | 2026-08-18 | Open, paused (M1). | Rulings on Devin/Cognition, Perplexity Comet, tier-scoped tools, Kling before anything is submitted. |
| 14 | Second batch leftovers: Suno, Character.AI | 2026-08-17 | Partly open; both held in `scripts/batch-submit.mjs`. | Pick Suno's identity domain; decide whether Character.AI is worth pursuing. |
| 15 | IP-based identity for the anonymous daily check cap | 2026-08-15 | Watch item, not blocking. Details partly out of date (see its note). | Revisit when real traffic exists. |
| 16 | Submit-flow reliability pass: questions only you can answer | 2026-10-09 | Open. Five questions from tracing the submit flow; the clear bugs were fixed on branch `claude/submit-flow` (see `changelog.md`). | Answer items 1-5 in the entry below. |

Pointer: the resolved 2026-09-19 entry "security audit decisions - 1-3 and 6 built locally, 4 is dashboard-only, 5 still unverified" is the top entry of `DECISIONS_ARCHIVE.md`; its items still awaiting Elliot are rows 1-6 above.

---

## Open (2026-10-09): submit-flow reliability pass, questions for Elliot

Branch `claude/submit-flow`, not merged, not deployed. The submit flow
(`SubmitTool.astro` -> `POST /v1/check` -> `pending_checks` -> auto-publish or
admin approve -> `/v1/lookup`) was traced end to end and is now covered by
`backend/src/submitFlow.e2e.test.ts` (real `schema.sql` in SQLite, real SSRF
wrapper) and `frontend/tests/submit-form.test.mjs` (headless browser). The clear
bugs are fixed (see `changelog.md`, 2026-10-09). The items below change policy,
cost or dependencies, so they were left as they are:

1. **Duplicate submissions of a new domain that is still waiting in the queue.**
   A second submission (another visitor, or a paid key) runs a second fetch and
   LLM call and adds a second queue row. Approving both works (the second is a
   no-op update). Options: (a) leave it; (b) when an unapproved row for the same
   domain already exists, answer 202 with that row's id, run nothing, and give
   the daily check back. (b) saves spend and queue noise but changes what the
   API does.
2. **A submitted subdomain whose policy is on the parent domain** (website
   `app.acme.com`, policy `acme.com/privacy`) is refused with
   `source_url_domain_mismatch`. Allowing it widens which hosts a submission can
   make the checker fetch, so it is your call, not a bug fix.
3. **Re-approving an already-approved queue row** rewrites the published entry
   with that row's facts, even if a newer check has published since. The runbook
   relies on this (step 4, the hancocyber.com re-approve), so it was not blocked.
   Keep as is, or refuse it unless an explicit `?force=1` is passed? Approving a
   *rejected* row also still publishes; say if that should be refused.
4. **"No readable text" threshold.** The new refusal only triggers when the
   page has no text at all after stripping scripts. A page with only a cookie
   banner or a "please enable JavaScript" line still goes to the LLM and then to
   the queue as unrated-looking. Keep it at "empty only", or set a minimum
   length?
5. **Frontend `npm audit`: 4 new advisories (3 high, 1 moderate)** in indirect
   dependencies (`http-cache-semantics`, `sharp`, `smol-toml`, `source-map-js`).
   `scripts/predeploy-check.mjs` fails on this, so it blocks a deploy. Lockfile
   unchanged by this pass. The fix is `npm audit fix` in `frontend/`, which is
   a dependency upgrade and needs your OK.

---

## Open (2026-09-17, post-launch): domain/policy-link validator too strict on subdomains

> **Status note (docs agent, 2026-09-19):** Possibly stale, verify. Current source allows subdomains: `isSourceHostAllowedForDomain` in `backend/src/check.ts` accepts the domain itself or a dot-boundary subdomain, and `frontend/src/components/SubmitTool.astro` applies the same rule. The error text quoted below no longer appears in `frontend/src`, `extension` or `backend/src`, and `changelog.md` (2026-09-19) says the entry looks fixed. Not confirmed against the live deploy (the changelog records the 2026-09-17 launch deploy and marks later work not deployed). Check after the next deploy by submitting a subdomain policy link.

> **Status note (2026-10-09, submit-flow pass):** Confirmed in source by tests: `midjourney.com` with a `docs.midjourney.com/...` link is accepted by the API and sent by the site form, then queued for a person (never auto-published, by the H2 rule). Live still unverified. See row 16 for the reverse case.

Submitting `midjourney.com` with policy link `docs.midjourney.com/hc/...`
was rejected by "Check the domain and policy link — one of them doesn't
look right." `openai.com` (with a same-subdomain policy link) worked
fine. Needs a decision on whether the validator should allow
same-registrable-domain subdomains (`docs.`, `www.`, `legal.`, etc.)
while still blocking genuine cross-domain mismatches. Check whether an
existing rule already covers this before changing anything — don't
conflate with the separate Bolt.new recheck already in flight from
Phase 2.5f. Not investigated or fixed here — log only.

## Blocked on you (2026-09-13, Phase 2.5j): JetBrains / Ideogram / Luma AI opt-out correction — verdicts computed, real-D1 write needed

> **Status note (docs agent, 2026-09-19):** Possibly stale, verify. `changelog.md` (2026-09-18) records pending ids 4, 5 and 6 approved as `not_compliant` (Ideogram, JetBrains, Luma AI), which implies the opt-out correction was applied. `DEPLOY_RUNBOOK_2026-09-19.md` step 4b says the correction was never written. These disagree and production can't be read from here. Read-only check for Elliot: select `domain, compliance_status` from `tools` where domain is `ideogram.ai`, `jetbrains.com` or `lumalabs.ai`, and `id, status` from `pending_checks` where id is 4, 5 or 6. If all three are `not_compliant` and approved, this entry and the two below can move to the archive.

Your ruling: none of the three quoted opt-out clauses actually govern AI training (JetBrains points at a vague non-mechanism in "Section 5, Transparency"; Ideogram's opt-out is Google Analytics/tracking-tech only; Luma's is a marketing-email unsubscribe — full clause detail in the "Open: Ideogram, Luma AI, and JetBrains AI Assistant" entry below). `opt_out_available` should be `false` for all three, not the currently-queued `true`.

**Computed verdicts** — pure application of `computeVerdict()`, no D1 access needed since all three already have `trains_on_user_data: true` (confirmed in the entry below):
```
if (facts.trains_on_user_data === null) return "unrated";
if (facts.trains_on_user_data === false) return "compliant";
return facts.opt_out_available === true ? "compliant_with_caveats" : "not_compliant";
```
With `opt_out_available: false`, all three resolve to **`not_compliant`** — JetBrains AI Assistant, Ideogram, and Luma AI (Dream Machine) all move away from the `compliant_with_caveats` framing the current (uncorrected) `true` value would otherwise produce.

**Blocked: persisting the correction.** All three live only as real-D1 `pending_checks` rows (#4 Ideogram, #5 JetBrains, #6 Luma AI) — no local copy to correct instead. Writing the fix needs a `--remote` D1 command, which is outside this pass's scope per your instruction to stop and report rather than work around it:

```
npx wrangler d1 execute policypeek-db --remote --command "UPDATE pending_checks SET extracted_facts = json_set(extracted_facts, '$.opt_out_available', json('false')) WHERE id IN (4, 5, 6);"
```

This only flips that one field in each row's `extracted_facts` — nothing else changes, and nothing publishes. After running it, all three stay in `pending_checks` awaiting the **normal admin approval step** (`POST /v1/admin/pending/:id/approve`) exactly as instructed — that approval is its own separate real-D1-touching action (same shape as the Bolt.new/HeyGen precedent), not implied by running the UPDATE above.

Optional read-only check to confirm the write landed before approving:
```
npx wrangler d1 execute policypeek-db --remote --command "SELECT id, domain, json_extract(extracted_facts, '$.opt_out_available') AS opt_out FROM pending_checks WHERE id IN (4, 5, 6);"
```

---

## Open (2026-09-13, Phase 2.5j update): Adobe Firefly — new evidence found, still not clean enough to call it resolved

> **Status note (docs agent, 2026-09-19):** Open. Adobe Firefly is not in `frontend/data/tools.json`, and `scripts/batch-submit.mjs` holds it (adobe.com is in `sharedDomains.ts`, so it would publish as `shared_domain_unverified`). Needs Elliot's pick among the strategies in the entry below. Production state not checkable from here.

Attempted strategy (a) from the entry below: tried Firefly/Adobe-specific URLs via a different fetch path (this session's own web-fetch tool, **not** the backend's actual SSRF-safe fetcher/Cloudflare Workers egress — flagging that distinction because it matters, see caveat at the end).

Results:
- `helpx.adobe.com/firefly/faq.html` — **403 Forbidden**.
- `helpx.adobe.com/acrobat/desktop/use-acrobat-ai/understand-usage-policies/content-usage-handling.html` — **403 Forbidden**.
- `business.adobe.com/resources/sdk/adobe-firefly-data-and-content-usage.html` (the existing candidate already in `research/tool_sources.json`) — **timed out after 60s**, consistent with the original "hangs indefinitely" diagnosis. Still structurally blocked, at least via this fetch path too.
- `adobe.com/legal/licenses-terms/adobe-gen-ai-user-guidelines.html` — **loaded successfully**, but it's an acceptable-use/content-credentials guide, not a privacy policy — no explicit training-data or opt-out statement, not usable as a source.
- **`adobe.com/privacy/policy.html`** — the exact URL previously diagnosed as hanging indefinitely against the backend's fetcher — **loaded successfully this time**, and contains genuinely on-point language: *"Subject to your opt-out rights... we may perform analytics with Cloud Content to help us understand how our users are using our Services,"* with *"These features are off by default and, should you choose to enable them, you can always disable these features,"* and a pointer to `helpx.adobe.com/manage-account/using/machine-learning-faq.html` for the actual opt-out mechanism. Read plainly, this points toward `trains_on_user_data: false` (off-by-default) rather than the `not_compliant`/`compliant_with_caveats` split the original framing assumed.

**Why I'm not calling this "solved" and moving on:**
1. **Fetch-path caveat.** This used a different fetcher/network path than the backend's actual extraction pipeline — different egress IP/ASN and likely different bot-detection treatment. Adobe's block on this exact URL was diagnosed as Akamai-style bot detection, which is commonly IP/ASN-based, not just user-agent-based — so this reachability result doesn't confirm the backend's own `safeFetchText` pipeline (running from Cloudflare Workers) would succeed if retried. Someone would need to actually retry it through the real pipeline to know.
2. **Shared-domain concern.** `adobe.com/privacy/policy.html` is Adobe's umbrella privacy policy covering every Adobe product, not a Firefly-specific page — this is exactly the pattern `CLAUDE.md`'s `shared_domain_unverified` override describes ("the tool's only public policy lives on a domain shared with unrelated products... a product-specific source page on that same shared domain does not resolve this — see the Amazon Q Developer precedent"). Whether this policy is specific enough to Firefly to source a verdict from, or whether it should route to `shared_domain_unverified` instead, is itself a judgment call I'm surfacing, not deciding.

So: strategy (a) didn't cleanly fail (there's real, favorable-looking language now visible) and didn't cleanly succeed either (fetch-path and shared-domain questions both open). Didn't attempt strategy (b) (archive.today) since (a) produced this ambiguous result rather than a clean failure to fall through on. Your call on how to proceed — retry through the real pipeline, treat this as `shared_domain_unverified`, or something else.

---

## Open (2026-09-13, Phase 2.5i): Adobe Firefly — still unreachable, needs a strategy pick (surfacing options only, not choosing)

> **Status note (docs agent, 2026-09-19):** Open. Needs Elliot's strategy pick (see status note on the entry above).

Recap of where this stands (full history: "Update (2026-08-18)" and
"Confirmed, not just suspected (2026-08-17)" entries further down): the
live page hangs indefinitely against two different fetchers (Akamai-style
bot detection stalling the connection, not a clean 403 — a longer
timeout can't fix an indefinite hang), and the Wayback Machine fallback
that rescued Windsurf doesn't work here either — archive.org itself
returns 429 specifically for Adobe URLs (ruled out as a generic
IP-rate-limit via an interleaved control test against Windsurf's URL from
the same session, which succeeded). No further retries were planned
without a new approach.

Three concrete next strategies, not picking one:

1. **Try a Firefly-specific URL instead of the corporate domain.** Both
   attempts so far used `adobe.com/privacy/policy.html` and
   `business.adobe.com` — Adobe's main corporate properties, likely
   behind Adobe's heaviest bot protection. Firefly has its own product
   pages (e.g. a `firefly.adobe.com` FAQ/legal page, if one states privacy
   terms) that may sit on different infrastructure, the same way Microsoft
   Copilot's FAQ page turned out to be reachable/extractable when its main
   product page wasn't (see the Copilot provenance entries below). Cheapest
   option to try — just a different URL through the existing pipeline, no
   new code.
2. **Try an archive source other than the Wayback Machine.** archive.org
   specifically seems to throttle/block Adobe content — a different
   on-demand or pre-existing archive (archive.today/archive.ph, or
   checking whether Common Crawl's index has a snapshot) might not have
   the same restriction. Would need `waybackFallback.ts`'s pattern
   extended to a second archive provider, or a one-off manual fetch if
   this is a single-tool exception rather than a general capability worth
   building.
3. **Accept the gap.** Adobe Firefly stays absent from the catalog,
   documented as a known, deliberate exclusion rather than an oversight.
   Reasonable if neither option above is worth the engineering time for
   one tool — revisit if it comes up again (e.g. a user submits it via
   `POST /v1/check` and hits the same wall live).

Not evaluated: browser-fingerprint-level evasion of Adobe's bot detection
(spoofing TLS/header fingerprints to look like a real browser). Technically
possible but meaningfully more engineering and ongoing-maintenance cost
than the above for a single catalog entry, and closer to actively working
around a vendor's anti-automation measures than the archive-fallback
approach already in place — flagging that it exists as an option only if
Elliot specifically wants to consider it, not recommending it.

---

## Ruled (2026-09-13, Phase 2.5j) — see the "Blocked on you" entry near the top of this file: Elliot has now ruled `opt_out_available` is `false` for all three (verdicts computed as `not_compliant`), blocked only on a real-D1 write. Original evidence writeup kept below for reference.

> **Status note (docs agent, 2026-09-19):** Evidence for the entry above; same status.

## Open: Ideogram, Luma AI, and JetBrains AI Assistant — opt-out fact isn't about AI training, awaiting Elliot's call

> **Status note (docs agent, 2026-09-19):** Evidence for the 2026-09-13 opt-out entry above; same status (possibly stale, verify).

Presenting evidence only, same as the Sourcegraph Cody writeup — not
approving, rejecting, or guessing at intent for any of these three.

### Ideogram (pending_check #4, domain `ideogram.ai`)

Queued facts: `trains_on_user_data: true`, `opt_out_available: true`.
Full extracted clauses:
> "We use User Input and other information you submit to the Services
> because it is in our legitimate interest to administer and improve the
> Services and improve and develop our products and technology."
> "training the models that power our Services"
> "To opt out of tracking by Google Analytics, you can download and
> install a plug-in available here."
> "you may block or delete certain Tracking Technologies from your
> browser"
> "We retain your information for as long as is reasonably necessary for
> the purposes specified in this Privacy Policy."

**What the opt-out actually governs**: Google Analytics tracking and
general browser tracking-technology blocking — not the training clause.
Nothing in the queued extraction ties an opt-out to the "training the
models" use specifically.

**Practical effect on the verdict:**
- Approve as-is (`compliant_with_caveats`, trusting `opt_out_available: true`
  at face value): publishes a caveats badge implying a real opt-out from
  training exists, which the actual clauses don't support.
- Treat the training opt-out as effectively unconfirmed (i.e. as if
  `opt_out_available` were `false`/unknown for this specific use):
  `computeVerdict` would give `not_compliant` instead.
- Leave queued / re-extract with a more targeted prompt or a different
  source page to see if a real training-specific opt-out exists
  elsewhere on the site that this pass didn't surface.

### Luma AI (Dream Machine) (pending_check #6, domain `lumalabs.ai`)

Queued facts: `trains_on_user_data: true`, `opt_out_available: true`.
Full extracted clauses:
> "Train, develop, and improve the artificial intelligence, machine
> learning, and models that we use to support our Services"
> "We collect the content of your conversations, including any
> information you choose to provide in your Inputs, and this information
> may be reproduced in the Outputs"
> "If you are located in the European Economic Area or the United
> Kingdom, we only process your personal information when we have a
> valid 'legal basis'"
> "You may opt out of marketing-related emails or texts by following the
> opt-out or unsubscribe instructions at the bottom of the marketing
> communication we send you"

**What the opt-out actually governs**: unsubscribing from marketing
emails/texts — entirely unrelated to AI training, more clearly
disconnected than Ideogram's case (Ideogram's opt-out is at least
data-adjacent; Luma's is pure marketing preference).

**Practical effect on the verdict:** same three options as Ideogram —
approve as `compliant_with_caveats` (opt-out fact taken at face value,
though it doesn't support the caveats story), recompute as `not_compliant`
(treating the training-specific opt-out as unconfirmed), or leave
queued/re-extract.

### JetBrains AI Assistant (pending_check #5, domain `jetbrains.com`)

Moved here from the "resolved" section above — see that writeup for the
full clause detail and live-page verification. Same three options as
Ideogram/Luma AI apply: approve as `compliant_with_caveats` at face
value, recompute as `not_compliant`, or leave queued/re-extract targeting
a page or section that actually states a training-specific opt-out if
one exists.

## Open, blocks further catalog growth (2026-08-18 night): `/about`'s "a human reviews it" claim doesn't match actual practice

> **Status note (docs agent, 2026-09-19):** Possibly stale, verify. Source-level parts of the plan are done: `about.astro` and `index.astro` describe auto-publish honestly and the tool page reads `auto_published`. Not confirmed: what the live site shows (deploy pending, runbook step 5), and whether the practice of showing Elliot the extracted quotes and source links at approval was adopted (`GET /v1/admin/pending` returns `extracted_facts`, including `relevant_clauses`, and `source_url`, so the material is there, but I found no code or doc that makes it the routine). New sourcing batches are also paused by manager decision M1 (`research/manager/decision_log.md`). Needed: Elliot says whether the review-integrity fix is enough to reconsider the pause.

Elliot flagged this himself, unprompted, after tonight's publishes: he
approved Amazon Q Developer, DeepL, and Windsurf by reading a chat summary
and saying "go ahead" — not by opening the source docs and checking the
extracted facts against them himself, which is what `/about` explicitly
promises ("Nothing reaches the tools list without someone checking the
extracted facts against the actual source before approving it").

Two distinct gaps, not one:

1. **Auto-publish (tier A) bypasses human review entirely, by design** —
   this was Elliot's own approved three-tier design (see the "three-tier
   auto-publish is live" entry below), but `/about`'s copy was never
   updated to reflect it and still makes a blanket "a human always
   reviews it" claim. `tools.auto_published` exists in the schema but
   isn't surfaced anywhere on the public site — a visitor has no way to
   tell which tools got which treatment.
2. **"Admin approval" in practice has meant trusting an agent's chat
   summary**, not independently checking extracted facts against the
   linked source the way the copy describes.

**Elliot's decision (2026-08-18 night): fix both** — tighten the actual
review practice (surface `auto_published` publicly; for anything routed
through manual approval, hand Elliot the real `relevant_clauses` quotes +
source links directly instead of a paraphrase, so approval means actually
looking at primary text) *and* rewrite `/about`'s methodology copy to
honestly describe the two-track system as it actually works. Neither has
been implemented yet — this is the plan, not the fix.

**The third research batch (17 tools, `research/third_batch_summary.md`)
is explicitly paused** — do not run it through the check/extraction
pipeline until this is sorted. Don't resume it on your own judgment; wait
for Elliot to confirm the review-integrity fix is in place first.

## Update (2026-08-18): third research batch sourced, 17 tools, not yet piped

> **Status note (docs agent, 2026-09-19):** Open, paused. New sourcing batches are paused by manager decision M1 (`research/manager/decision_log.md`). The questions below (Devin and Cognition domain identity, Perplexity Comet, tier-scoped Gamma and Recraft, Pika, Kling) still need Elliot before anything is submitted. `scripts/batch-submit.mjs` holds `devin` for the `crossDomainSources.ts` reason.

Research Agent's weekly pass (`CLAUDE.md`'s Growth Loop cadence). Full
writeup in `research/third_batch_summary.md`, URLs in `research/tool_list.md`
and `research/tool_sources.json`. Sourcing only — nothing here has touched
`POST /v1/check`, the extraction pipeline, or `frontend/data/tools.json`.

Worth your eyes before it's run through the pipeline, roughly in order of
how much judgment they need:

- **Devin (Cognition) is a sharper version of the still-open Bolt.new-style
  "disjoint domain" question.** Product is at `devin.ai`; the governing
  Privacy Policy/ToS/DPA all live on `cognition.ai`/`cognition.com`. Worse
  than Bolt.new/StackBlitz: Cognition's single privacy policy explicitly
  names *both* "Devin and Windsurf" as covered products — so one legal
  document spans two differently-branded, differently-domained consumer
  products. The `crossDomainSources.ts` mechanism (see the entry below)
  could technically point one or both at `cognition.com`, but which
  domain(s) get the product-facing `tools` row, and whether one shared
  policy covering two products is even the right shape for that mechanism,
  is a real design call, not a mechanical add — not resolved tonight,
  flagging as the likely next candidate for that allowlist.
- **Perplexity Comet** — same-vendor, same-apex-domain (`perplexity.ai`)
  multi-product case, genuinely different from the AWS/Vercel
  "unrelated products crammed onto one company's domain" shape the
  `shared_domain` heuristic was built for. Worth deciding whether the
  heuristic should treat "two products, same company, same domain,
  different privacy notices" differently before this one goes through.
  Direct fetch to its privacy notice 403'd twice — sourced from a
  WebSearch summary, not an independently confirmed fetch.
- **Tier-scoped answers, same pattern as DeepL**: Gamma (free tier trains
  by default, Team/Business don't; DeepL precedent from the deep-dive above
  argues for rating the free tier with an explicit summary caveat) and
  Recraft (a different axis — content ownership/visibility by tier, not
  training, which does have a tier-independent opt-out).
- **Pika** — client-rendered SPA, same failure mode already fixed for
  Character.AI (`extraction.ts`'s fail-fast on empty extracted text); expect
  null training facts unless the fetcher clears the JS wall.
- **Kling AI** — lowest-confidence entry in the batch: every direct fetch
  attempt returned HTTP 446 (unusual, possibly geo/bot-block), so facts are
  WebSearch-summary-only, not fetch-confirmed. China-based parent
  (Kuaishou) also raises an international-transfer/GDPR-adequacy question
  beyond what sourcing alone can answer. Recommend a follow-up fetch
  attempt before this one goes through extraction with any confidence.
- Also flagged, lower stakes: Continue.dev's possible (unconfirmed)
  acquisition by Cursor/Anysphere — would eventually mirror the
  Devin/Windsurf shape if confirmed; Gamma/Teal/Perplexity Comet all had at
  least one 403'd direct-fetch source, WebSearch-summary-only for those
  specific claims.
- Two tools were skipped outright, not guessed: Cleo AI (privacy pages
  403 across every domain variant tried) and Sora (would just duplicate
  OpenAI's already-sourced ChatGPT policy, not real new coverage).

## For review whenever convenient (2026-08-17): 4 items from the second research batch — 3 of 4 now resolved, see status notes

> **Status note (docs agent, 2026-09-19):** Partly open. Three of the four items are resolved in the entry itself. Suno and Character.AI are still held (`HELD` in `scripts/batch-submit.mjs`; runbook 4b): Suno's policy URL is on suno.ai while the product and terms are on suno.com, so an identity domain has to be picked, and Character.AI's legal pages are client-rendered. The 2026-09-13 legacy-backlog ruling (archived) lists suno.ai and character.ai among the 9 not being migrated; resubmit fresh if wanted.

Full detail in `research/second_batch_summary.md`. Original text kept below
for context; status notes added 2026-08-18 rather than deleting history.

- **Amazon Q Developer** (`aws.amazon.com`) and **v0** (`vercel.com`) sit on
  shared apex domains — the `shared_domain` heuristic (`sharedDomains.ts`)
  will fire on these automatically once submitted, same as Gemini/Copilot.
  No action needed unless you disagree they're shared.
  **Status: resolved.** Both published. v0 auto-published in the overnight
  run (see "Ran overnight" above). Amazon Q Developer was published
  2026-08-18 per Elliot's live go-ahead, correctly still flagged
  `shared_domain_unverified` — see the "Published (2026-08-18)" entry above
  for the reasoning on why a good product-specific source page didn't
  change that call.
- **Character.AI** — legal pages are a client-rendered SPA; the fetcher may
  only get an empty shell instead of real policy text on submission. Worth
  a manual look if it comes back `unrated` with null facts.
  **Status: partially resolved.** The suspected extraction crash was
  confirmed real and fixed (`extraction.ts` now fails fast with an honest
  `empty_extracted_text` reason instead of sending garbage to Haiku) — see
  "Ran overnight" above. Character.AI itself is still not published; its
  legal pages still don't render without JS, so it still needs a non-SPA
  source before it can get real facts. Left alone tonight per Elliot's
  explicit instruction.
- **DeepL** and **Suno** have genuinely different data-training answers for
  free vs. paid tiers — not an extraction bug, needs a decision on which
  tier PolicyPeek rates (same "which product line" question as GitHub
  Copilot's Free/Pro vs Business/Enterprise split, already noted in
  `tool_sources.json`).
  **Status: DeepL resolved, Suno still open.** DeepL published 2026-08-18,
  rated on the free tier with an explicit tier-caveat summary sentence
  noting Pro/API differs — see "Published (2026-08-18)" above. Suno is
  still blocked on the JSON-parse extraction bug noted in "Ran overnight"
  above (unrelated to the tier question itself) and hasn't reached the
  point where the tier decision is even needed yet. Left alone tonight per
  Elliot's explicit instruction.

## Flagging, not blocking (2026-08-15): IP-based identity for the anonymous daily check cap

> **Status note (docs agent, 2026-09-19):** Watch item, not blocking. The details below predate later changes, all visible in code: the cap is per UTC calendar day, not rolling 24h (`rateLimit.ts`); IPv6 is keyed by /64 (`auth.ts`); a global ceiling of 200 free checks a day exists (`rateLimit.ts`); old IP rows are purged daily by a cron (`backend/wrangler.toml`). Revisit when there is real traffic. Related escalations are in `research/manager/decision_log.md` (M11: failed fetches return the daily slot; one IPv6 /48 actor).

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

