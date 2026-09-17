# Decisions Needed

## Resolved (2026-09-17): "Reviewed by a human" field now reads off `auto_published`, not `verified`

Closes the entry below. Turned out narrower than it looked: `auto_published`
already existed as a real column (`schema.sql`: `INTEGER NOT NULL DEFAULT 0
CHECK (auto_published IN (0, 1))`), and `admin.ts`'s two write paths were
already setting it correctly — `approvePendingCheck` (the human `/approve`
endpoint) has exactly one caller, always passing `{ autoPublished: false }`;
`tryAutoPublishAtomic` hardcodes `auto_published = 1` on both its `INSERT`
and `UPDATE` branches. **No migration and no `admin.ts` change were needed
this pass** — the gap was purely that the field was never exposed past the
backend.

**Repo-wide check on `verified` before touching anything**, per
instruction: it's read in two other places —
`backend/src/cron.ts:52` (`SELECT ... FROM tools WHERE verified = 1`, the
monthly-recheck cron's query for "which rows are live published tools") and
`backend/src/lookup.ts:109` (exposed as-is in the public `GET /v1/lookup`
API response). Neither is about human review — `verified` genuinely means
"this is a real published row," a different, still-needed concept.
**Not removed, not repurposed** — left exactly as-is, only the frontend
display now points at the right field.

**Backfill: not needed, not guessed.** Rather than assume the original
bulk-run tools were unreconstructable, queried real D1 directly for all 32
current rows' `auto_published` values and cross-checked every single one
against this project's own `changelog.md`/`DECISIONS_NEEDED.md` history
(which mechanism published it, and when):

| Tools | `auto_published` | Matches documented history? |
|---|---|---|
| JetBrains AI Assistant, Ideogram, Luma AI (Dream Machine), Fireflies.ai, You.com, Granola, Kagi, v0 | `true` | Yes — 2026-08-17 seed batch, auto-published before the 08-18 `compliant_with_caveats` ruling existed |
| Bolt.new, HeyGen | `false` | Yes — approved via the real admin endpoint, Phase 2.5h (09-07) |
| Amazon Q Developer, DeepL, Windsurf | `false` | Yes — required human attention (shared-domain call / unresolved facts) |
| Claude, Cursor, ChatGPT, ElevenLabs, Gemini, Grammarly, Microsoft Copilot, Midjourney, Notion AI, Perplexity AI | `true` | Yes — the documented "10 auto-published (Tier A)" list from Phase 2's bulk run, verbatim |
| Copy.ai, GitHub Copilot, Jasper, Otter.ai, Replit AI, Runway, Stability AI (DreamStudio), Zoom AI Companion | `false` | Yes — the 8 tools Elliot approved 2026-09-03 |
| Sourcegraph Cody | `true` | Yes, but with a caveat — see below |

Every one of the 32 currently-published rows checks out. **No row needed
the "unreviewed" safe-default fallback** — there's no gap between what
exists in real D1 today and what the documented history says should be
there.

**One genuine nuance, not a discrepancy — flagging rather than smoothing
over**: Sourcegraph Cody shows `auto_published: true` (it went through the
Tier-A pipeline path on 2026-09-06, per that day's own changelog entry:
*"Clean facts, no null critical fact, brand-new domain → Tier A,
auto-published without needing a manual approval step"*). But Elliot had
separately reviewed `research/sourcegraph_cody_followup.md` by hand and
approved publishing *before* that submission ran. So "Reviewed by a human:
No — auto-published" is mechanically accurate (a human didn't click
approve on this specific row through the admin endpoint) but slightly
undersells that Elliot did personally review the underlying research for
this one. Not treating this as a bug to fix — `auto_published` correctly
answers "did this reach `tools` via the automatic path," which is a
narrower, different question than "did any human look at any part of
this," and that's an inherent limit of what a single boolean can express.

**What actually shipped**: `frontend/src/types.ts` (new `auto_published`
field on `Tool`, doc comments on both fields), `scripts/generate-tools-
json.mjs` (added to the `SELECT`/output), `frontend/data/tools.json`
(regenerated — diffed first, confirmed the *only* change is the new field
appearing on every row, nothing else moved), `frontend/src/pages/tools/
[domain].astro` (reads `auto_published` inverted: `"No — auto-published"`
vs `"Yes"`, replacing the old `"Yes"`/`"Not yet"` wording that implied
review was merely pending rather than never happening). Security review:
`security/review-2026-09-17-auto-published-field.md`, 0 findings — no
write path or auth-adjacent code touched. Verdicts untouched, as
instructed.

---

## Open (2026-09-17, UI polish pass): "Reviewed by a human" field can read "Yes" for a tool no human reviewed

Found during a CSS/UI audit, but it's a data-accuracy issue, not a style
one — not touched, logging instead since it overlaps with the already-open
`/about` + homepage copy item above.

`frontend/src/pages/tools/[domain].astro` shows a `Reviewed by a human:
Yes / Not yet` row on every tool's detail page, driven by `tool.verified`.
Checked `backend/src/admin.ts` directly: `verified` is hard-coded to the
literal `1` in **both** `approvePendingCheck` (the human `/approve` path)
**and** `tryAutoPublishAtomic` (the fully automatic Tier-A path) — both the
brand-new-domain `INSERT` and the existing-domain `UPDATE` branches of the
auto-publish path set `verified = 1` unconditionally. So this field can't
actually distinguish "a human looked at this" from "the pipeline
auto-published it because the facts were clean" — the exact same
inaccuracy already flagged for `/about`'s and the homepage's prose, but
here it's a literal Yes/No fact field on every single tool page, not just
copy tone.

Given the original Phase 2 bulk run alone auto-published 10 tools (Tier A:
"clean, deterministic facts"), there are very likely several published
tools right now showing "Reviewed by a human: Yes" that no human actually
reviewed. Whether the fix is a new column tracking real human review
distinctly from `verified`/`auto_published`, or just changing this
specific label to read off `auto_published` instead (`auto_published:
false` → "Reviewed by a human: Yes", `auto_published: true` → "Published
automatically — clean, deterministic facts" or similar) is a real design
decision + likely a small schema/copy change, not something to guess at
alongside a CSS audit.

---

## Resolved, stopgap only (2026-09-17): `compliant_with_caveats` icon set generated programmatically

Elliot asked for this to be built even without real design tooling
available. No SVG-to-PNG rasterizer exists anywhere in this environment
or the project's dependency tree (checked: no `rsvg-convert`,
`imagemagick`, `cairosvg`, `PIL`, no `sharp`/equivalent in
`node_modules`) — rather than add a new dependency, hand-encoded the 4
PNGs directly with a one-off Python script using only the standard
library (`zlib`/`struct` for raw PNG chunk encoding, `8x8` supersampling
for anti-aliased edges). Script itself was not committed (a throwaway
generation tool, not project code).

Design: a filled center disc + two thin concentric ring lines around
it, all in `--caveat-fg` (`#12586f`, the same light-theme value the
other extension icons already use as their solid-fill color, e.g.
green-fg `#1e7a34` for `compliant`) — porting Badge.astro's solid-teal-
double-border treatment into a flat single-hue icon silhouette,
consistent with every other icon in the set being a plain shape on a
transparent ground (no two-tone background fill introduced). Outer
diameter matches the existing solid dots' proportions. Visually
inspected all 4 sizes directly (16/32/48/128) before committing — the
double-ring separation is honestly a bit soft at 16px (any two
sub-1px-wide bands would be at real-world icon scale), but it's clearly
distinguishable from both the plain solid dot (`compliant`) and the
single hollow ring (`shared_domain_unverified`) at every size, which is
the actual thing that matters for at-a-glance recognition in a toolbar.

**This is a stopgap, not final branding.** Programmatically-generated
geometric shapes, not designed art — Elliot may replace with real
design work later without needing to touch any code (`iconPathsFor` in
`badgeCopy.js` just resolves a state name to a file path, so swapping
in better-designed PNGs at the same 4 filenames is a drop-in
replacement).

---

## Resolved (2026-09-17): data-collection disclosure fixed — `browsingActivity`, not `none`

Elliot's call: the extension does send the active tab's domain to
`api.getpolicypeek.com` on every lookup, and the full tab URL on an
explicit submission — that's real browsing-activity transmission, so
`manifest.json`'s Firefox disclosure should say so rather than `"none"`.

- `extension/manifest.json`:
  `browser_specific_settings.gecko.data_collection_permissions.required`
  changed from `["none"]` to `["browsingActivity"]`. Category name and
  spelling confirmed directly against Mozilla's current
  extension-data-collection support documentation
  (`extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/`),
  which lists it exactly as: *"Browsing activity — Information about the
  websites users visit, such as specific URLs, domains, or categories of
  pages users view."*
- **No accompanying description field exists in this schema** — checked
  directly, `data_collection_permissions` only supports `required`/
  `optional` category arrays, nothing else. The plain-language
  explanation Elliot drafted belongs in AMO's own listing/submission
  form fields, not `manifest.json` — kept here for whoever does the
  actual submission:
  > "The domain of the site you're currently on is sent to PolicyPeek's
  > backend to check its privacy/compliance status. Used only to return
  > a badge — not stored beyond what's needed to serve the result, not
  > sold, not used for tracking or advertising."
- **Chrome has no manifest-level equivalent at all** — confirmed this
  disclosure lives entirely in the Chrome Web Store Developer
  Dashboard's "Privacy practices" tab (a data-usage checklist + privacy
  policy URL filled in at submission time), not any field in
  `manifest.json`. Chrome's own policy explicitly permits browsing-activity
  collection "to the extent required for a user-facing feature described
  prominently in the Product's Chrome Web Store page and in the Product's
  user interface" — so the dashboard disclosure needs to be paired with
  listing copy that actually says this. Drafted, not committed anywhere
  (it's store-listing copy, not code) — Elliot's sentence:
  > "PolicyPeek checks the site you're currently on by sending its domain
  > to our server and returning a compliance badge. No other data is
  > collected."
- Icon-assets blocker above is separate and still open — not touched.

---

## Open (2026-09-17, post-launch): domain/policy-link validator too strict on subdomains

Submitting `midjourney.com` with policy link `docs.midjourney.com/hc/...`
was rejected by "Check the domain and policy link — one of them doesn't
look right." `openai.com` (with a same-subdomain policy link) worked
fine. Needs a decision on whether the validator should allow
same-registrable-domain subdomains (`docs.`, `www.`, `legal.`, etc.)
while still blocking genuine cross-domain mismatches. Check whether an
existing rule already covers this before changing anything — don't
conflate with the separate Bolt.new recheck already in flight from
Phase 2.5f. Not investigated or fixed here — log only.

## Open (2026-09-17, post-launch): new-tool submission → pending-review path not yet smoke-tested in production

A recheck of an existing tool (OpenAI) was confirmed working end-to-end
on the live site. Submitting a brand-new, not-yet-reviewed tool through
the human-review gate hit the daily free-tier rate limit before it
could be tested. Needs a real test once the limit resets — confirm it
lands in pending-review state rather than auto-publishing. Not
investigated or fixed here — log only.

## Blocked on you (2026-09-13, Phase 2.5j): JetBrains / Ideogram / Luma AI opt-out correction — verdicts computed, real-D1 write needed

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

## Resolved (2026-09-13, Phase 2.5j): true legacy pending-review backlog — Elliot's ruling: not migrating

Elliot's ruling: none of the 9 legacy tools get migrated from the stale local blobs. Closing this as **not migrating** — if any of these 9 get prioritized later, re-submit fresh through `POST /v1/check` against real D1 rather than reviving 3-4-week-old `extracted_facts` (several already have unresolved core facts, e.g. `rev.com`/`speechify.com`/`poe.com` all show `trains_on_user_data: null`, and policy pages may have changed since 2026-08-17 anyway). No code or data change made — this is a decision closed, not an engineering task done.

Original discovery writeup, kept for the record:

The 2026-09-13 audit flagged that the 2026-09-06 changelog's "17-item
legacy pending-review backlog (Tabnine, Synthesia, etc., predating
Phase 2)" phrase doesn't reconcile with the only local artifact that
could hold it (12 non-terminal rows). Checked further this pass —
**a real-D1 query would not resolve this even if run**: the 2026-09-06
"Task 1 (real D1)" entry explicitly scoped carrying over `pending_checks`/
`compliance_changelog` history as **out of scope**, on purpose — only the
31 known-good *published* tools were migrated. The legacy backlog was
never in real D1 to begin with, so there's no `--remote` query that would
find it.

The only surviving copy is the orphaned pre-cutover local file
(`backend/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/57ca0628...
.sqlite`, frozen 2026-09-06 10:24). Queried it directly (a local file
read, not a live D1 connection) — 12 non-terminal `pending_checks` rows,
but 3 of them are not legacy at all: `openai.com` and `sourcegraph.com`
(created 2026-09-01, i.e. during Phase 2, not predating it) and
`deepl.com` (created 2026-09-06). All three are already published in the
current catalog (`ChatGPT`/`compliant_with_caveats`, `Sourcegraph Cody`/
`compliant`, `DeepL`/`not_compliant`) — resolved through the real
pipeline entirely separately from this old file.

**The genuine legacy backlog — created 2026-08-17, predating Phase 2,
still not in the catalog at all — is 9 tools, not 17 or 12:**
`tabnine.com`, `suno.ai`, `synthesia.io`, `wordtune.com`, `sudowrite.com`,
`rev.com`, `speechify.com`, `poe.com`, `character.ai`. Confirmed each is
absent from current `tools.json` (i.e. genuinely never published, not
just missing from this stale snapshot).

Where "17" came from originally isn't determinable from anything in this
repo — possibly a miscount at the time, or it included rows that have
since moved/been deleted from this file for other reasons. Not guessing
further.

**If you want these 9 in the catalog:** re-submitting each fresh through
`POST /v1/check` against real D1 is almost certainly simpler and more
correct than trying to migrate 3-4-week-old `extracted_facts` blobs out of
this orphaned file — policy pages may have changed since 2026-08-17, and
the fresh pipeline will re-verify rather than trust stale extracted text.
No code needed either way; this is a decide-and-run-the-submissions call,
not an engineering one.

---

## Open (2026-09-13, Phase 2.5i): /about and homepage copy claims 100% human review — no longer true, needs your sign-off before it ships

**The problem:** both `frontend/src/pages/about.astro` (line 34-38) and
`frontend/src/pages/index.astro` (line 39) state, unconditionally: *"A
human reviews it before it's published. Nothing reaches the tools list
without someone checking the extracted facts against the actual source
before approving it."* That was true when written but has been false
since the three-tier auto-publish system shipped (2026-08-17,
`backend/src/autoPublish.ts`): a clean, deterministic extraction (no null
critical facts, no verdict flip on a recheck, not sourced from a Wayback
fallback) publishes immediately with no human in the loop. This is a
public trust claim about the product, not an internal detail, so per the
kickoff's instruction I drafted a fix but did **not** ship it — your call
on the wording and whether anything else needs to change alongside it.

**Drafted replacement for `about.astro`'s step 3** (keeps the trust
framing by explaining *why* skipping review is safe, rather than just
admitting it isn't 100%):

> **A human reviews it — unless the extraction is unambiguous.**
> Every result is checked against a fixed set of auto-publish criteria:
> if every fact the rule above needs was clearly stated in the policy —
> nothing missing, nothing ambiguous — and, on a recheck, the badge
> wouldn't change, it publishes immediately. Anything less clear-cut — a
> policy that doesn't answer the key question, a rating that would flip
> on a recheck, or a source pulled from a web archive because the live
> page blocks automated checks — always gets a human's eyes before it's
> published. Either way, the same fixed rule from step 2 decides the
> badge; a human never overrides it, they only confirm the facts it ran
> on.

**Drafted replacement for `index.astro`'s bullet** (shorter, same idea,
links to the fuller explanation which is already one line below it):

> Clear-cut results publish immediately under a fixed rule; anything
> ambiguous — a missing fact, a recheck that would change the badge, an
> archived source — gets a human's eyes first.

**Not built, flagging as a separate option:** there is currently no
visible per-tool distinction between "a human approved this" and "this
auto-published" anywhere on the site — `tools.auto_published` exists in
D1 but isn't carried into `frontend/data/tools.json` at all (confirmed in
`ARCHITECTURE_NOTES.md`'s field-level diff) and no template reads it. If
you want that distinction visible (e.g. a small "auto-published" tag next
to the badge, similar to how `shared_domain_unverified` gets its own
outlined badge treatment), that's a real UI/visual-language decision on
top of the copy fix above — same category as the 2026-08-17 "Visual
direction (Compliance Label)" decision — so I didn't design or build
anything here, just flagging that the copy fix alone doesn't make the
distinction inspectable per-tool, only true in aggregate.

**Nothing published or edited in the live copy.** Say the word (or edit
directly) and I'll wire in whichever wording you want, plus the
`tools.json`/template plumbing if you also want the per-tool badge.

---

## Resolved (2026-09-07, Phase 2.5h): Bolt.new and HeyGen approved — JetBrains AI Assistant moved to "needs Elliot's call," not approved

Of the 5 queued rechecks from Phase 2.5f, this kickoff described 3 as
"straightforward rules-version corrections" (Bolt.new, HeyGen, JetBrains
AI Assistant) and 2 as needing a human look (Ideogram, Luma AI). Per the
kickoff's own instruction not to assume "straightforward" without
checking, re-verified all three against their live source pages before
approving anything — **JetBrains didn't hold up**, see below. Only
Bolt.new and HeyGen were actually approved.

**Bolt.new** (pending_check #2): opt-out clause verified directly against
`stackblitz.com/privacy-policy` — "Depending on account type or plan,
users may have the ability to limit or opt out of the use of AI Inputs
and AI Outputs for **model training or improvement**." Explicit,
on-point. Approved via the real admin endpoint
(`POST /v1/admin/pending/2/approve`) against real D1. `compliant` →
`compliant_with_caveats`. Confirmed on `tools` (id 5, `updated_at`
2026-09-07T08:57:15.963Z) and `compliance_changelog` (trigger + app-level
rows, both `compliant → compliant_with_caveats`, note "approved from
pending_check #2").

**HeyGen** (pending_check #3): verified directly against
`heygen.com/privacy` — "To train and enhance the models that power our
products and services... **You may request to opt-out of this training
and enhancement** by contacting us at [email]." Explicit, on-point (found
in two places on the page, same mechanism both times). Approved
(`POST /v1/admin/pending/3/approve`). `compliant` → `compliant_with_caveats`.
Confirmed on `tools` (id 6, `updated_at` 2026-09-07T08:57:22.038Z) and
changelog (same pattern as Bolt.new, note "approved from pending_check #3").

**JetBrains AI Assistant (pending_check #5) — NOT approved, moved to the
open section below.** Its queued clauses reference "Section 5,
Transparency" for how opt-outs work, but don't state what that section
actually covers. Fetched `jetbrains.com/legal/docs/privacy/privacy/`
directly to check: Section 5 itself contains no opt-out mechanism at all
("we will inform you about the categories of Personal Data... and the
data management options that you may have") — it just points elsewhere.
The actual opt-outs stated on the page are for **marketing emails**
(unsubscribe link) and **cookies/personalized advertising** ("Opt-Out"
link), plus a general deletion-request email. Nothing on the page ties
an opt-out to AI training specifically — same shape of problem as
Ideogram and Luma AI below, just not caught when this kickoff (and my own
Phase 2.5f note, which was wrong on this point) called it straightforward.

**Temp API key note**: turned out not to matter here — `POST
/v1/admin/pending/:id/approve` only needs `X-Admin-Token`
(`requireAdminToken`), it doesn't go through `resolveTier`/the daily cap
at all, so the Phase 2.5f temp key (still revoked from before, confirmed
via `SELECT revoked FROM api_keys WHERE label = 'phase2.5f-temp-testing-key-2026-09-06'`
→ `1`) was never needed and wasn't touched. Worth remembering for next
time: the free-tier cap only applies to `POST /v1/check`, not the admin
approval path.

---

## Ruled (2026-09-13, Phase 2.5j) — see the "Blocked on you" entry near the top of this file: Elliot has now ruled `opt_out_available` is `false` for all three (verdicts computed as `not_compliant`), blocked only on a real-D1 write. Original evidence writeup kept below for reference.

## Open: Ideogram, Luma AI, and JetBrains AI Assistant — opt-out fact isn't about AI training, awaiting Elliot's call

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

## Resolved (2026-09-07, Phase 2.5g): tools.json regenerated from real D1 — all 15 drifted tools synced, not just the 6 originally scoped

`frontend/data/tools.json` (what the live site actually builds from) was
stale against real D1 for far more than the 5 tools + Sourcegraph Cody
originally scoped. Caught before touching anything, per this task's own
"stop if the diff shows anything unexpected" instruction — see below for
why the earlier audit missed it.

**Original 6** (as scoped): ChatGPT, ElevenLabs, Grammarly, Perplexity AI,
Midjourney — `compliance_status` corrected to match D1 (`compliant` →
`compliant_with_caveats` for the first four, `not_compliant` →
`compliant_with_caveats` for Midjourney); Sourcegraph Cody — synced to the
Phase 2.5f republish (`trains_on_user_data: true` → `false`, source URL
now `cody-notice`, new summary/data_retention).

**9 more, found while diffing, none a verdict change** — Claude, Copy.ai,
Cursor, GitHub Copilot, Gemini, Microsoft Copilot, Replit AI, Stability AI
(DreamStudio), Zoom AI Companion. All had `summary`/`data_retention`/
`gdpr_mentioned` drift only — each of these went through Phase 2's real
extraction+approval pipeline on 2026-09-01 or 2026-09-03 (confirmed via
each row's D1 `updated_at`), refreshing their facts, and that refresh
never made it back into `tools.json` either. Elliot reviewed the full
15-tool diff and approved widening scope to sync all of them in one pass,
since none introduce a new judgment call.

**Audit-methodology gap, not just a data gap:** the Phase 2.5e consistency
audit (`research/rules_consistency_audit.md`) only compared
`compliance_status` and `trains_on_user_data` between `tools.json` and
D1 — it never compared `summary`, `data_retention`, or `gdpr_mentioned`,
so it structurally couldn't have found these 9. Worth remembering for any
future audit of this kind: compare the *full* stored fact set, not just
the fields that feed `computeVerdict`, or a "clean" audit result doesn't
actually mean the two stores agree.

**Mechanism**: new script, `scripts/generate-tools-json.mjs` — reads
every `tools` row from real D1 (`wrangler d1 execute --remote`), converts
D1's storage shapes (0/1 integers, a JSON-string `source_urls` column)
into the plain booleans/arrays `tools.json` already uses, sorts
case-insensitively by name (matching the existing file's order), and
replicates the existing file's `\uXXXX`-escaped-non-ASCII formatting so a
diff against a hand-edited version doesn't show spurious noise. Defaults
to writing a separate `tools.generated.json` so a diff can be reviewed
before replacing the real file — never overwrites `tools.json` directly
on its own.

Verified: generated output diffed against the live file (all 15 changes
individually re-confirmed against direct D1 queries, not just trusted
from the diff — this is exactly how the file first got flagged as having
more drift than expected, so re-checking mattered). `tools.json` replaced,
temp file removed, `astro build` succeeded (35 pages), and 11 pages
spot-checked directly in the built HTML: all 5 flipped-verdict tools plus
Sourcegraph Cody show the correct badge and updated facts; Claude/Cursor
(9-tool group, no verdict change) still show correct unchanged badges;
Zoom (whose `summary` went to `null`) renders cleanly with no literal
"null" and the reason paragraph correctly omitted; Kagi/Fireflies.ai
(unrelated tools) render unaffected.

**Not decided here — recommendation, not a decision:** whether this
script becomes part of the actual `astro build`/deploy step (source of
truth stays D1, `tools.json` is never hand-stale again) versus staying a
manual "run when needed" tool. Recommend the former eventually, but there
isn't a real deploy pipeline yet to wire it into — revisit as part of the
Phase 3 deploy conversation rather than deciding in isolation now.

## Resolved (2026-09-06, Phase 2.5f): workers.dev subdomain confirmed — narrow, deploy stays blocked

Running the real app pipeline (`/v1/check`, `/v1/admin/pending/:id/approve`)
against real D1 without a `wrangler deploy` requires `wrangler dev
--remote`, which itself requires the Cloudflare account to have a
`workers.dev` subdomain registered. There's no `wrangler` CLI subcommand
for this in the installed version (4.119.0) and no interactive y/n prompt
either — `wrangler dev --remote` just hard-errors with a dashboard link.
Elliot approved registering one (over Telegram) specifically to unblock
this phase's work, then found the account already had one from before
(`elliotink.workers.dev`) — nothing new was actually registered, just
confirmed to already exist. Retrying `wrangler dev --remote` then worked
immediately.

**Explicit boundary, per Elliot's own instruction, also logged in
`CLAUDE.md`:** this is the account-level subdomain namespace only.
**Does not authorize `wrangler deploy` or `wrangler publish`** — both stay
on the deny list, unchanged, needing their own separate approval.

**Flag for the Phase 3 deploy conversation, not decided here:** once
deploy is eventually approved, publishing without a custom domain
configured makes the worker reachable by default at
`<project-name>.<subdomain>.workers.dev`. Custom domain setup should be an
explicit item in that conversation rather than something that happens by
default because the subdomain already exists from this narrower step.

**Operational note for future `--remote` pipeline testing:** going through
`wrangler dev --remote` means Cloudflare sets the real `CF-Connecting-IP`
at the edge — it correctly ignores a client-supplied header override, so
every request from one agent session shares one real IP and burns the
free-tier daily cap after a single check. A temporary `paid`-tier
`api_keys` row (same pattern as Phase 2's local-only batch-testing key,
see the 2026-09-01 entry) sidesteps this — created for this phase
(`label = 'phase2.5f-temp-testing-key-2026-09-06'`), used for the 6 checks
below, and should be revoked once this phase is fully wrapped up (not done
as of this entry — flagging so it doesn't get forgotten).

---

## Resolved (2026-09-06, Phase 2.5f): Sourcegraph Cody published as `compliant`, superseding the stale entry

Closes the 2026-09-03 "Sourcegraph Cody left queued" entry below and the
2026-09-01 original fact-discrepancy flag. Elliot reviewed
`research/sourcegraph_cody_followup.md` (independently corroborated in
Phase 2.5e) and approved publishing.

Ran a real `POST /v1/check` against `https://sourcegraph.com/terms/cody-notice`
(added to `research/tool_sources.json` as `cody_notice`, replacing
`privacy_policy` as this tool's actual source — see that file's updated
note) through `wrangler dev --remote`, real D1. Fresh extraction:
`trains_on_user_data: false`, `data_retention` reflecting the zero-retention
LLM-partner language, `relevant_clauses` quoting the "does not train on
your code unless you provide permission" line directly. Clean facts, no
null critical fact, brand-new domain → Tier A, auto-published without
needing a manual approval step.

**Verified, not assumed:** `computeVerdict` correctly produced `compliant`
(the only valid bucket when `trains_on_user_data` is `false`, regardless
of `opt_out_available` — the old stale entry's `compliant` was coincidentally
the same label but for the wrong reason, an artifact of a fact that
wasn't actually true). Confirmed directly on real D1: `tools.id = 32`,
`source_urls = ["https://sourcegraph.com/terms/cody-notice"]`,
`verified = 1`, `auto_published = 1`; `compliance_changelog` has the
expected trigger + app-level insert pair (rows 32/33, both
`null → compliant`). Real D1 tool count: 31 → 32.

**tools.json still doesn't have this entry synced from D1** — same
`tools.json`/D1 gap flagged repeatedly elsewhere (`ARCHITECTURE_NOTES.md`,
`research/rules_consistency_audit.md`). Not fixed here, out of this
phase's scope.

---

## Resolved (2026-09-06, Phase 2.5f): 5 pre-ruling tools rechecked — all correctly queued, none auto-published, none touched on real D1

Bolt.new, HeyGen, Ideogram, JetBrains AI Assistant, Luma AI — all flagged
in `research/rules_consistency_audit.md` as `compliant` with
`trains_on_user_data: true`, auto-published before the 2026-08-18
`compliant_with_caveats` ruling existed, never rechecked since. Each run
individually through a real `POST /v1/check` (their existing on-file
source URL, `wrangler dev --remote`, real D1) — no batching, no forced
outcome.

**All 5 landed the same way**, and it's worth being precise about *why*,
since the original kickoff assumed a different mechanical outcome than
what the code actually does:

| Tool | Fresh facts | Fresh verdict | Existing verdict | Outcome |
|---|---|---|---|---|
| Bolt.new | trains=true, opt_out=true | `compliant_with_caveats` | `compliant` | Queued (pending_check #2) |
| HeyGen | trains=true, opt_out=true | `compliant_with_caveats` | `compliant` | Queued (#3) |
| Ideogram | trains=true, opt_out=true | `compliant_with_caveats` | `compliant` | Queued (#4) |
| JetBrains AI Assistant | trains=true, opt_out=true | `compliant_with_caveats` | `compliant` | Queued (#5) |
| Luma AI (Dream Machine) | trains=true, opt_out=true | `compliant_with_caveats` | `compliant` | Queued (#6) |

**None auto-published**, and correctly so given the code as written:
`evaluateAutoPublish` queues *any* recheck whose computed verdict differs
from the existing stored status — it has no special case for "this is
just a rules-version correction, the facts are the same," it only knows
"verdict changed on a recheck," full stop (see `autoPublish.ts`'s comment
on that branch). The kickoff for this task assumed the mechanical case
would auto-publish; the code disagrees, and that's the code correctly
doing its one job (any flip gets a human look) rather than a bug —
changing that distinction would be exactly the kind of verdict-methodology
judgment call `CLAUDE.md` reserves for Elliot, not something to patch
around in this pass.

**Two of the five are worth a second look at approval time, not just a
rubber-stamp**, because the `opt_out_available: true` fact each landed on
doesn't obviously support an AI-training-specific opt-out:
- **Ideogram**: the only opt-out clauses extracted are about Google
  Analytics tracking and general browser tracking-technology blocking —
  not an opt-out from the model-training clause specifically.
- **Luma AI**: the only opt-out clause extracted is about unsubscribing
  from *marketing emails/texts* — unrelated to AI training at all.

Bolt.new, HeyGen, and JetBrains AI Assistant's opt-out facts look more
directly on-point (explicit account-setting/contact-based opt-outs from
the training/improvement use itself). Not fixing or re-judging any of
this here — flagging so whoever approves these five doesn't treat
`opt_out_available: true` as self-evidently correct across all five.

**Confirmed no side effects on the unreviewed four... five**: real D1's
`tools` rows for all 5 domains are untouched (`updated_at` still shows the
original 2026-08-17 publish time), and `compliance_changelog` has no new
rows for any of them — the pipeline ran for real, computed for real, and
correctly stopped short of writing anything, exactly matching "let it
queue, don't force an outcome."

**`opt_out_available` persistence — still a gap, not fixed here, as
flagged in `research/rules_consistency_audit.md`.** Confirmed again with
fresh data: the fact exists in each `pending_checks.extracted_facts` JSON
blob (all 5 show it above), but `tools` still has no `opt_out_available`
column (`backend/schema.sql`), so it's still lost the moment (if/when)
any of these five gets approved. Whoever approves these should know the
approval itself won't durably record which specific fact justified
`compliant_with_caveats` over `not_compliant` beyond what's in this
writeup and the changelog note text — worth deciding on a schema change
separately, not bundled into this recheck pass.

## Resolved (2026-09-06, Phase 2.5c): Low finding — duplicate compliance_changelog rows on concurrent duplicate submissions

Closes finding #3 in `security/review-2026-09-06-concurrency.md`, left
open deliberately during Phase 2.5b since it wasn't in scope for the two
High fixes.

**Root cause confirmed**, reproduced first with the harness before
touching any code (`node security/loadtest/load_test.mjs samedomain-recheck 5`
against `kagi.com`, seeded then hit with 5 concurrent rechecks landing on
the same `compliant` verdict): the `compliance_changelog` DB trigger
(`trg_tools_changelog_on_update`, `backend/schema.sql`) already correctly
no-ops on a same-value write via its `WHERE OLD.compliance_status IS NOT
NEW.compliance_status` guard — that trigger was never the source of the
duplicates. The actual cause is the *application-level* explicit
`compliance_changelog` INSERT that both `admin.ts::approvePendingCheck`
(human `/approve` path) and `admin.ts::tryAutoPublishAtomic` (Phase 2.5b's
auto-publish path) fire unconditionally after every successful write,
regardless of whether the value actually changed. Fix #2's compare-and-
swap write (`UPDATE ... WHERE id = ? AND compliance_status = ?`) still
matches every concurrent racer when the verdict being swapped is
unchanged — the guard protects against a *stale* read, not against a
*repeated identical* one — so all N racers' writes legitimately succeed,
and pre-fix, each one then logged its own "auto-published from
pending_check #N" row for a status that never moved. Confirmed via direct
row inspection: 5 concurrent `kagi.com` rechecks produced 5 rows, all
`compliant → compliant`, distinct pending_check IDs, near-identical
timestamps.

**Fix applied (application-level guard, not a trigger change):** both
explicit INSERTs in `admin.ts` now check `old_status !== new_status`
(comparing against `existing.compliance_status` in `approvePendingCheck`,
`freshRead.compliance_status` in `tryAutoPublishAtomic`; a null/nonexistent
prior row always counts as "changed," so first-ever publishes still log)
before firing — mirroring the DB trigger's own condition instead of
diverging from it. The compare-and-swap write logic itself is untouched.
No trigger rewrite was needed since the trigger was never the problem;
correspondingly **no real-D1 migration is needed for this fix** — it's
pure application code, so it takes effect automatically whenever the
backend is next deployed (Phase 3), with nothing to run against real D1
in the meantime.

**Re-verified after the fix:**
- Same repro (5 concurrent `kagi.com` rechecks, same verdict): **0**
  additional changelog rows (was 5) — only the original seed insert's 2
  rows (trigger + app, an existing, unrelated, out-of-scope 2x on every
  brand-new insert) remain.
- Fix #1 regression (10 concurrent same-IP checks): still 1/10 accepted,
  9/10 capped — unaffected, as expected (this change never touches
  `rateLimit.ts`).
- Fix #2 regression (5 and 8 concurrent first-ever submissions of a
  fresh domain, `plausible.io` and `usefathom.com`): exactly 1 `tools` row
  each time, no corruption, no unreviewed flips — unaffected, as expected
  (this change never touches the publish decision or the CAS write, only
  a downstream log call). Note: neither run happened to catch a genuine
  simultaneous-INSERT race window this time (real network/Haiku timing
  spaced the 5-8 requests out enough that each fresh-read saw the prior
  one's commit) — that's timing variance in the test environment, not a
  regression signal; the invariant that matters (no duplicate/corrupted
  `tools` rows) held regardless.
- Two new regression tests added: `backend/src/admin.changelogDedup.test.ts`
  (`tryAutoPublishAtomic` logs nothing on an unchanged-verdict recheck,
  still logs on a genuine flip). Full suite: **65/65 passing** (was 63).

## Resolved (2026-09-06, Phase 2.5b): both High concurrency findings fixed and re-validated with the harness

Elliot reviewed the proposed fixes below and specified the exact approach
to use for each (superseding the original proposals on two points) — see
`security/review-2026-09-06-concurrency.md` for the original findings this
resolves.

**Fix #1 — rate-limit, implemented as atomic INSERT (as proposed):**
`anonymous_check_log` now has a `(client_ip, day_bucket)` PRIMARY KEY
instead of an `AUTOINCREMENT id` + rolling-24h `SELECT`. `rateLimit.ts`'s
`isUnderDailyCap`/`recordAnonymousCheck` (separate read-then-write) are
replaced by `tryReserveDailySlot` (a single `INSERT OR IGNORE`, checking
`meta.changes` to know if the reservation was won) and `releaseDailySlot`
(a compensating `DELETE`, called on any validation/fetch failure so a bad
request still doesn't burn the slot — same rule as before, just
reserve-then-release instead of check-then-record). **Deliberate behavior
change, called out explicitly per Elliot's instruction:** the cap is now
per UTC calendar day, not a rolling 24h window — a check at 11:58pm and
another at 12:02am now count as two different days rather than being
blocked. Accepted tradeoff, not a silent side effect: D1/SQLite has no
easy atomic way to enforce "1 per rolling 24h" the same way it does "1 per
calendar day."

**Fix #2 — verdict-publish, implemented as compare-and-swap (stronger
than the originally-proposed "fresh read," per Elliot's explicit
instruction not to stop at that):** `check.ts`'s `runExtraction` now takes
a fresh `SELECT` of the tool's live status immediately before deciding
(replacing the stale submission-time `isRecheck` snapshot for this
decision only — the snapshot is kept for the unrelated `pending_checks
.is_recheck` display value). That same fresh snapshot is then used as an
actual compare-and-swap guard on the write itself, in a new
`admin.ts::tryAutoPublishAtomic` (kept separate from `approvePendingCheck`,
which the human-driven `/approve` endpoint still uses unchanged — a human
approving one at a time never races itself): a brand-new domain publishes
via `INSERT ... ON CONFLICT (domain) DO NOTHING RETURNING id`; an existing
domain publishes via `UPDATE tools SET ... WHERE id = ? AND
compliance_status = ?`, checking `meta.changes`. Either way, `changes = 0`
means another writer won the race in the gap since the snapshot was taken
— `runExtraction` treats that as `published: false` and routes the
`pending_check` to human review (a new `extraction_error` note,
`auto_publish_raced: ...`) instead of assuming success or retrying.

**Harness re-run, all required cases pass** (`security/loadtest/`):
- 10 concurrent same-IP checks: **1/10 accepted, 9/10 correctly capped**
  (was 10/10 accepted before the fix).
- 5 concurrent first-ever checks of a fresh domain (`sourcegraph.com`):
  **zero unreviewed flips** — 2 of 5 legitimately agreed and published
  (matching verdicts, correctly resolved via CAS), the other 3 computed a
  differing verdict and were correctly queued for human review by the
  now-fresh flip-guard check (`extraction_error: null`, `status:
  'extracted'`, visible in the admin queue) rather than silently
  publishing or dropping. Re-ran once more with `kagi.com` (deterministic
  facts, no LLM variance) as a sanity check: all 5 legitimately resolved
  to the same verdict via sequential CAS writes, no failures.
- General stress N=5/20/50: no crashes, no unhandled errors (some 429s at
  N=50 from synthetic-IP range reuse across back-to-back test invocations
  — a harness timestamp-seeding quirk, not a Worker-side issue; confirmed
  by an empty `error`/`exception`/`uncaught` grep of `wrangler dev`'s log
  for this run).
- SSRF re-confirmed unaffected (neither fix touched `ssrf.ts`): 75/75
  correctly blocked across N=5/20/50, matching the original findings
  exactly.

All 63 backend tests pass (`rateLimit.test.ts` rewritten for the new
day-bucket helpers; `check.rateLimit.test.ts`'s fake-D1 mock updated to
enforce `(client_ip, day_bucket)` uniqueness, plus one new regression test
proving only one of two same-IP concurrent submissions can ever hold the
reservation).

**Sign-off: yes, from a concurrency-safety standpoint, ready for Phase 3.**
Both High findings are fixed and empirically re-validated with the same
harness that found them. The Low finding (redundant changelog rows on a
same-verdict concurrent recheck) remains open — cosmetic, not a blocker,
not in this fix's scope.

**Resolved (2026-09-06, same day): real D1 schema sync applied.** Elliot
explicitly approved a narrowly-scoped `wrangler d1 execute --remote` for
this one table/operation (see `CLAUDE.md`'s updated deny-list entry for
the exact approved scope). Confirmed `anonymous_check_log` was genuinely
empty (0 rows) on real D1 before touching it, so this was a clean
drop-and-recreate with **no data lost, because there was none to lose** —
not a lossy migration by necessity, just an empty table. Applied via a
2-statement SQL file (`DROP TABLE IF EXISTS` + `CREATE TABLE` with the new
`(client_ip, day_bucket)` PRIMARY KEY, matching local dev's Phase 2.5b
schema exactly). Verified directly against real D1 afterward, not just
trusted the success message:
- Schema: `SELECT sql FROM sqlite_master WHERE name='anonymous_check_log'`
  shows the correct new shape.
- Other tables confirmed untouched: same 5 real tables present, `tools`
  still 31 rows, `compliance_changelog` still 31 rows.
- Smoke test (matching Phase 2.5b's local proof): `INSERT OR IGNORE` with
  a given `(client_ip, day_bucket)` → `changes: 1`; the identical insert
  repeated → `changes: 0` (correctly ignored); the same IP with a
  different `day_bucket` → `changes: 1` again. Exactly the atomicity
  Phase 2.5b's fix relies on, now proven against real D1, not just local.
  Smoke-test rows deleted afterward, table confirmed empty again (0 rows).

**Real D1 is now considered ready for the Phase 2.5b code.** No other
remote command was run beyond this one table's drop+recreate and the
smoke-test insert/delete cleanup — no `wrangler deploy`/`secret`/publish,
no other table touched.

---

## Resolved (2026-09-06): Phase 2.5 concurrency validation found 2 real High findings, proposed fixes (superseded, see above)

Elliot's Phase 2.5 kickoff asked for a real load-test harness against local
D1 + `wrangler dev` (not a unit test, not real infra) probing three
suspected races before Phase 3 deploy. Built it
(`security/loadtest/load_test.mjs` + `mock_ssrf_server.mjs`), ran it at
N=5/20/50 plus targeted smaller-N race probes, full findings and evidence
in `security/review-2026-09-06-concurrency.md`. Summary:

- **[HIGH] Rate-limit cap is trivially bypassed by concurrent same-IP
  requests** — confirmed 2/2, 5/5, and 10/10 racers all got through the
  1-per-24h anonymous cap when fired concurrently with a fresh IP each
  time. The check-then-act gap between `isUnderDailyCap` and
  `recordAnonymousCheck` (two separate D1 calls with real work in between)
  is the root cause. Proposed fix: an atomic `UNIQUE`-constraint-based
  INSERT-and-catch-conflict instead of SELECT-then-INSERT — a real design
  change to the cap's mechanism (would also mean switching from a rolling
  24h window to a coarser day-bucket), not something to silently patch.
- **[HIGH] Concurrent first-time submissions of a brand-new domain can
  silently bypass the "verdict changed → queue for human review" gate** —
  the more serious finding. `handleCheck` snapshots `isRecheck` once at
  submission time and it goes stale if a concurrent sibling for the same
  new domain publishes first; `evaluateAutoPublish`'s flip-guard is keyed
  off that stale flag, so a losing racer's *different* verdict can
  silently auto-publish with zero review. Confirmed empirically with 5
  simultaneous first-ever submissions of `sourcegraph.com`: 2 of 5 caused
  real, unreviewed verdict flips. Does NOT affect concurrent rechecks of
  an *already-published* domain (confirmed separately, safe). Proposed
  fix: re-check the tool's live status unconditionally inside
  `runExtraction`, right before the auto-publish decision, instead of
  trusting the stale snapshot — not applied, since changing when/how the
  verdict-flip safety gate fires is exactly the kind of methodology-
  adjacent call `CLAUDE.md` reserves for Elliot even though the code lives
  in `check.ts`, not `rules.ts`.
- **[LOW] Redundant changelog audit rows** on concurrent duplicate
  submissions of the same domain when the verdict doesn't change — noisy,
  not corrupting, held per the kickoff's instruction not to patch mid-flight
  on an unscheduled pass.
- **[INFORMATIONAL] SSRF redirect validation — checked under real
  concurrency (N=5/20/50, 75/75 correctly blocked), no races found.**
  General robustness soak test (N=5/20/50 real traffic) — no crashes, no
  unhandled errors.

**Not signed off for Phase 3 as-is** — both High findings should be fixed
and re-validated with this same harness before real concurrent public
traffic hits this pipeline. Local dev D1 was reset to a clean empty schema
after this exercise (the race-corrupted test data — e.g. `sourcegraph.com`
ending up with a verdict determined by network timing rather than review —
was never real data and shouldn't be mistaken for it later); the real
Cloudflare D1 database was not touched by any part of this exercise.

---

## Resolved (2026-09-06): Phase 2's Task 1 (real D1) and Task 3 (security review) both complete

Elliot confirmed `wrangler login` was done and a real Cloudflare D1 database
("PolicyPeek", uuid `95eb15f7-cce3-4d50-bba4-ffa2f3163f8c`) already existed
— he'd created it himself. Completed the rest of Task 1:

1. `wrangler.toml`'s `database_id` updated from the placeholder to the real
   uuid.
2. `schema.sql` applied to the real database via `wrangler d1 execute
   --remote --file=./schema.sql` — verified directly afterward (not just
   trusted the success message) that the current 5-value
   `compliance_status` CHECK constraint and both changelog triggers are
   actually present on the remote database.
3. All 31 known-good local-dev tools carried over to the real database via
   a generated `INSERT` script (explicit ids preserved, apostrophes in
   summary text correctly escaped — checked directly, e.g. v0's "Vercel's"
   round-tripped intact). Verified row count (31) and spot-checked 5
   verdicts against expectations post-import.
4. Confirmed remote `api_keys` is empty — the temporary batch-testing key
   from Phase 2 never touched the real database.

**Side effect worth knowing, not a bug:** changing `wrangler.toml`'s
`database_id` repoints local `wrangler dev`/`d1 execute --local` at a new,
empty local SQLite file (local D1 storage is keyed by database_id) — the
old data-bearing local file is still on disk, orphaned but harmless, not
deleted. Local dev now effectively starts fresh going forward; the real
data lives in the real database now, which was the point.

**Task 3** (security review re-pass against real batch traffic): done, see
`security/review-2026-09-06.md`. No new High/Medium/Low findings — the only
backend file that changed since the 2026-08-18 review is `check.ts` (the
auto-publish try/catch fix), reviewed and clean. One informational item
carried forward, not blocking: Phase 2's 19-tool batch proved correctness
at volume but was run sequentially, not concurrently, so `safeFetchText`'s
SSRF check and the daily-cap rate limiter haven't actually been exercised
under genuine concurrent load — worth a real concurrency test before Phase
3 exposes this to public traffic.

**Not done, out of today's scope:** carrying over `pending_checks`/
`compliance_changelog` history beyond the fresh insert-triggers, or
migrating the 17-item legacy pending-review backlog (Tabnine, Synthesia,
etc., predating Phase 2) to the real database — Task 1's mandate was
specifically the known-good published tools, not in-progress operational
data. Flagging so it's a deliberate scope call, not an oversight, if it
comes up later.

---

## Open (2026-09-03): Sourcegraph Cody left queued — genuine old-vs-fresh fact disagreement, Elliot's call

Of the 9 tools queued from Phase 2's bulk run, Elliot reviewed facts for all 9
and approved 8 via the real admin endpoint (`POST /v1/admin/pending/:id/
approve`) on 2026-09-03: Copy.ai, GitHub Copilot, Jasper, Otter.ai, Replit AI,
Runway, Stability AI, Zoom AI Companion. All 8 landed exactly where expected —
`unrated` for the 7 with a null `trains_on_user_data`, `not_compliant` for
Otter.ai (trains=true, opt_out unstated, matching Phase 1's independent
re-check of this same page) — and every one matches what `tools.json` already
had, confirmed before approving. Local D1: 23 → 31 tools.

**Sourcegraph Cody (pending_check #43) deliberately left queued**, per
Elliot's explicit instruction ("leave sourcegraph for now") — this is the
tool flagged 2026-09-01 where the fresh extraction (`trains_on_user_data:
null`) disagrees with the existing `tools.json` entry (`trains_on_user_data:
true`, rated `compliant`). Not a bucket-relabeling case like Grammarly/
Perplexity AI — a real fact disagreement. Options still on the table: publish
as `unrated` (trust the fresh extraction), keep the old `compliant` rating
(trust the original, more-thorough-at-the-time sourcing), or have Research
look at the live page directly before deciding. No default was applied.

## Resolved (superseded by 2026-09-03 and 2026-09-06 activity): all 9 queued tools below are now resolved — see changelog.md

8 of the 9 approved 2026-09-03 (Copy.ai, GitHub Copilot, Jasper, Otter.ai, Replit AI, Runway, Stability AI, Zoom AI Companion); Sourcegraph Cody published `compliant` separately on 2026-09-06 (see that entry above). Confirmed all 9 present in `tools.json` with the approved verdicts as of the 2026-09-13 audit. Task 3 (security review) and the real-D1 migration mentioned below also both completed 2026-09-06 (see "Resolved (2026-09-06): Phase 2's Task 1 (real D1) and Task 3 (security review) both complete" above). Original writeup kept below for the record.

## Open (2026-09-01): Phase 2 bulk run complete — 9 tools await your manual approval, 1 fact discrepancy logged, security review still pending

**Bulk run finished**: 19/19 tools processed through the real pipeline
across 4 batches, no further schema errors after the fix above. Local D1:
13 → 23 of 32 `tools.json` domains. Full per-tool breakdown and cost is in
`changelog.md`'s batch-by-batch entries; summary here:

- **10 auto-published** (tier A — clean, deterministic facts): Claude,
  Cursor, ChatGPT, ElevenLabs, Gemini, Grammarly, Microsoft Copilot,
  Midjourney, Notion AI, Perplexity AI.
- **9 correctly queued** (tier B — a null critical fact) for your manual
  review, not auto-approved: Copy.ai (#27), GitHub Copilot (#33), Jasper
  (#35), Otter.ai (#39), Replit AI (#41), Runway (#42), Sourcegraph Cody
  (#43), Stability AI (#44), Zoom AI Companion (#45). `GET
  /v1/admin/pending` shows each with its `queue_reason`.
- **Total run cost: ~$0.108** (estimate; see the earlier note on why this
  HTTP path doesn't expose real Anthropic token usage — if precise
  billing numbers matter for the credit-budget tracking, that needs a
  small `extraction.ts` change to capture and log the real `usage` field
  from the API response, not attempted here since it wasn't asked for
  and changes the pipeline code under test).
- Temporary batch API key revoked (`api_keys.id = 1`).

**New fact discrepancy found, not resolved**: Sourcegraph Cody's fresh
extraction returned `trains_on_user_data: null`, disagreeing with
`tools.json`'s existing entry (`trains_on_user_data: true`, currently
rated `compliant`). Unlike the Grammarly/Perplexity AI cases above (old
data predates the `compliant_with_caveats` bucket, same underlying facts
just bucketed differently), this is a genuine facts disagreement between
the two stores. It's currently harmless in practice — the fresh run
correctly queued rather than auto-publishing over the existing rating —
but it's a second entry (after Microsoft Copilot) in what might be a
pattern worth watching once D1-vs-`tools.json` reconciliation happens:
old hand-curated entries may have been sourced with more context (a
specific page section, a human's own reading) than a single
single-page fetch reproduces today.

**Still pending, not started**: Task 3 (security review re-pass against
real batch traffic) — held per your instruction not to run it against
local D1 only when the real D1 is coming. Also still open from Task 1:
carrying the 13 (now 23) known-good local tools over to the real database
once it exists.

---

## Resolved (2026-09-01): local D1 schema fixed, check.ts's silent-failure gap fixed, ChatGPT/ElevenLabs re-verified correct

Elliot's call on the entry below: fix local D1 now (safe), fix the
check.ts error-handling gap before resuming the batch, then re-verify.
All three done:

1. **Local D1 migrated in place**, preserving every existing row and id
   (13 original tools + Claude/Cursor from batch 1 = 15 tools; 30
   changelog rows; 29 pending_checks; the temp API key — all confirmed
   present with unchanged ids after). Mechanically: SQLite can't alter an
   existing CHECK constraint, and this repo's `tools` table is a FK
   target of `compliance_changelog.tool_id` with two triggers
   (`trg_tools_changelog_on_insert/update`) whose bodies hardcode `INSERT
   INTO compliance_changelog` — dropping/recreating `tools` directly hit
   both the FK constraint (D1's batch execute doesn't appear to honor
   `PRAGMA foreign_keys=OFF` mid-batch — SQLite documents that pragma as a
   no-op inside a transaction, which a `--file` batch apparently is) and
   then the triggers firing against a momentarily-missing
   `compliance_changelog`. Worked around by: drop both triggers up front,
   strip and restore `compliance_changelog`'s FK around the `tools` swap
   (never dropping an FK-referenced table while anything still declares
   that FK), then recreate both triggers verbatim at the end. Verified:
   `SELECT sql FROM sqlite_master WHERE name='tools'` shows the corrected
   5-value CHECK constraint; a live `/v1/lookup` call worked immediately
   after with no restart needed; a full local sqlite file backup was
   taken before starting (`scratchpad/pre-migration-backup.sqlite`,
   session-local, not part of the repo).
2. **`check.ts`'s silent-failure gap fixed**: the auto-publish step
   (`evaluateAutoPublish` + `approvePendingCheck`) is now wrapped in its
   own `try/catch`, separate from the existing one around `extractFacts`.
   On failure, writes `auto_publish_failed: <message>` into
   `pending_checks.extraction_error` instead of leaking an unhandled
   `ctx.waitUntil` rejection — makes a future instance of this exact
   failure mode (not just this specific bug) visible in `GET
   /v1/admin/pending` instead of invisible. All 59 existing backend tests
   still pass after the change.
3. **ChatGPT and ElevenLabs re-run fully through `POST /v1/check`** (not
   the cached-facts admin-approve shortcut, to avoid mis-attributing
   `auto_published` — see below) — both now correctly auto-publish as
   `compliant_with_caveats` with `auto_published = 1`, confirmed via
   direct D1 query. Chose a full re-run over reusing the cached
   `extracted_facts` via `POST /v1/admin/approve/:id` specifically
   because that endpoint records `autoPublished: false` — using it here
   would have permanently mis-tagged these two rows as human-approved
   when they were always meant to auto-publish, corrupting exactly the
   provenance signal `auto_published` exists to carry. Cost: 2 more
   extraction calls (~$0.0106 total, on top of the ~$0.024 already spent
   in batch 1) — acceptable given the alternative was permanently wrong
   provenance data.
4. The two original stuck rows (`pending_check` #25, #29) marked
   `rejected` via `POST /v1/admin/pending/:id/reject` — superseded by
   #30/#31, kept in `pending_checks` as history rather than deleted.

Resuming the remaining 14 tools now.

---

## Open, STOPPED the batch run for this (2026-09-01): local dev D1 has a stale CHECK constraint that silently swallows every `compliant_with_caveats` auto-publish

Phase 2's bulk pipeline run, batch 1 of ~4 (5 tools: ChatGPT, Claude,
Copy.ai, Cursor, ElevenLabs) via the real `POST /v1/check` → extraction →
`evaluateAutoPublish` → `approvePendingCheck` path, using a temporary
local-only `paid`-tier API key (see below) to get past the anonymous
daily cap for batch volume.

**What happened:** ChatGPT and ElevenLabs both extracted clean facts
(`trains_on_user_data: true`, `opt_out_available: true` — no null critical
fields) and `evaluateAutoPublish` correctly returned `eligible: true,
reason: "clean extraction, deterministic verdict"` for both — confirmed
by querying `GET /v1/admin/pending` directly, which recomputes and shows
that exact reason string. But **neither actually got published** —
both are stuck at `pending_checks.status = 'extracted'`, looking exactly
like a normal tier-B queue item from the outside.

**Root cause, found in `wrangler dev`'s own log, not guessed:**
```
D1_ERROR: CHECK constraint failed: compliance_status IN
('not_compliant', 'compliant', 'unrated', 'shared_domain_unverified'):
SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_CHECK)
```
Note what's missing from that list: **`compliant_with_caveats`**. Local
dev D1's `tools` table was created before Elliot's 2026-08-18
`compliant_with_caveats` ruling and never re-migrated — `schema.sql`
already has a comment warning about exactly this ("SQLite... can't alter
an existing CHECK constraint in place, so any local D1 created before
this change needs a fresh migration... Do not run this against any
real/deployed database"), but this local instance apparently predates
that warning being heeded. ChatGPT and ElevenLabs are the first two
tools in this whole project's history to actually compute
`compliant_with_caveats` through the real pipeline (Cursor and Claude
both came back `compliant` outright — `trains_on_user_data: false` — so
they never hit this bucket, and everything published before 2026-08-18
predates the bucket existing at all) — that's why this has never surfaced
until now.

**A second, worse thing this exposed:** the failure was completely
silent. `check.ts::runExtraction`'s `try/catch` only wraps the
`extractFacts` call — the `evaluateAutoPublish`/`approvePendingCheck`
call after it has no error handling at all. When `approvePendingCheck`'s
INSERT throws, it's an unhandled rejection inside `ctx.waitUntil()`,
logged only to the Worker's own console (invisible to `GET
/v1/admin/pending`, which just shows the stuck row as if it were a normal
tier-B queue item) and never recorded anywhere in `pending_checks` itself
— `extraction_error` stays `NULL`. A tool stuck this way is
indistinguishable from a genuinely-queued one without reading raw Worker
logs. Worth Backend's attention independent of the schema fix: any future
exception in the auto-publish path (not just this one) fails the exact
same silent way.

**Stopped here rather than continuing batches 2-4**, since any tool that
computes to `compliant_with_caveats` will hit the same wall, and piling
up more silently-stuck rows against a local D1 I already know is stale
isn't useful work — all of it needs redoing once real D1 exists anyway.

**Options, not deciding for you:**
1. Fix local dev D1 now (drop and re-migrate from current `schema.sql`,
   per its own instructions) and resume the batch locally. No data loss
   risk for the existing 13 tools — none of them use
   `compliant_with_caveats`, confirmed by direct query, so re-migrating
   loses nothing meaningful.
2. Hold Task 2 entirely until the real D1 (Task 1, waiting on your
   `wrangler login`) exists, since it'll be freshly migrated from current
   `schema.sql` and won't have this bug — redo the whole bulk run there
   instead of doing it twice.
3. Separately: decide whether `runExtraction`'s auto-publish path should
   catch exceptions and write to `extraction_error` (so a future version
   of this exact failure is visible in the admin queue instead of only in
   Worker logs) — flagging as a Backend robustness item, not fixing it
   myself since it's error-handling *behavior*, adjacent to but not the
   same as the immediate schema fix.

**Also created:** a temporary local-only `paid`-tier API key
(`api_keys.id = 1`, label `phase2-bulk-run-internal (local dev only,
temporary)`) so batch submissions bypass the 1-per-24h anonymous cap
without touching rate-limiting logic itself. Local D1 only, not a
secret, not committed anywhere (D1 rows aren't tracked in git). Should be
revoked (`UPDATE api_keys SET revoked = 1 WHERE id = 1`) once this phase's
bulk run is done, so it doesn't linger as an unused live credential.

**Batch 1 results so far** (for the record, since 2 of 5 are stuck):
- Claude → `compliant` (`trains_on_user_data: false`), auto-published,
  matches `tools.json`'s existing entry.
- Cursor → `compliant` (`trains_on_user_data: false`), auto-published,
  matches `tools.json`'s existing entry.
- Copy.ai → `trains_on_user_data: null`, correctly queued (tier B, null
  critical fact) — no bug here, this is the auto-publish gate working
  as designed.
- ChatGPT, ElevenLabs → stuck per above, not actually published despite
  clean facts.



## Resolved (2026-09-13, Phase 2.5i — superseded, not directly fixed): Copilot's D1 summary can't be synced — no D1 row exists for it at all

**Root cause investigation (Phase 2.5i, per the 2026-09-13 audit's Phase C ask):**
this entry was accurate when written (2026-09-01, local dev D1 only, before
real D1 existed) — `microsoft.com` was indeed one of the 19 `tools.json`
domains missing from local D1 at that time (see `ARCHITECTURE_NOTES.md`'s
field-level diff). It stopped being true later that same day without this
entry ever being updated: the "Phase 2 bulk run complete" entry below lists
**Microsoft Copilot as one of the 10 auto-published tier-A tools** in that
run (local D1: 13 → 23), and the 2026-09-06 "Task 1 (real D1)" entry
further down confirms all 31 known-good local-dev tools — Microsoft
Copilot included — were carried into real D1 via a generated INSERT
script, verified by row count (31) afterward.

**Confirming evidence I could check without a live D1 query** (this pass
never runs `--remote`): `frontend/data/tools.json`'s current Microsoft
Copilot row was produced by Phase 2.5g's `scripts/generate-tools-json.mjs`
regeneration directly from **real** D1 on 2026-09-07 (commit `5f85cc7`) —
it shows a fully populated row (`verified: true`, `shared_domain: true`,
real facts, not placeholder/default values), which the regen script could
only have produced if a real-D1 row for `microsoft.com` existed at that
query time. A direct `SELECT * FROM tools WHERE domain='microsoft.com'`
against real D1 would confirm this definitively but wasn't run here.

**Nothing to fix in code** — the underlying gap this entry described no
longer exists. Leaving the original text below for the historical record
of the diagnosis, since Task 1's `summary`-sync request itself was never
revisited once a row started existing.

---

Follow-up to the entry below: asked to sync D1's `summary` field for
Copilot and v0 to match the new `tools.json` text (two-row write, nothing
else touched). **v0/`vercel.com` done** — updated directly via `wrangler
d1 execute --local`, confirmed by both a direct D1 query and a live
`GET /v1/lookup?domain=vercel.com` call returning the new text (the exact
path the extension popup uses).

**Copilot/`microsoft.com` could not be done** — there's no row for it in
local D1 at all (part of the 19-tool coverage gap documented in
`ARCHITECTURE_NOTES.md`). "Update the summary field" has nothing to act
on. I did not insert a new row to work around this: that would mean
deciding values for every NOT NULL column myself (not just summary),
which is exactly the kind of one-off, unreviewed write the source-of-
truth writeup below argues against doing more of. If you want Copilot
addressable locally before Phase 2, that's either a full row insert
(scoped, reviewed, done deliberately) or resolved by whichever direction
comes out of the source-of-truth decision — flagging rather than picking
one myself.

---

## Resolved (2026-09-01): Copilot and v0 now show their specific unverified reason, not the generic shared-domain sentence

Follow-up to the diagnosis below. Elliot's call: both should read as
unverified for their *actual* reason (Copilot's source is stale/covers
"the older version"; v0's source was never product-scoped at all), not
reuse shared-domain's generic wording for an unrelated problem — but
without building new verdict infrastructure.

**What I found tracing the render path end-to-end (your step 1):** the
`compliance_status` bucket, `rules.ts`'s override, and `Badge.astro`'s
outlined/dashed rendering for `shared_domain_unverified` were already
exactly right for both tools — **both were already rendering outlined,
not solid**, before this task started (`shared_domain: true` was already
set on both). The actual gap was one level down: `frontend/src/pages/
tools/[domain].astro` and `tools/index.astro` both had `tool.shared_domain
? <hardcoded generic sentence> : tool.summary` — meaning **any** tool
flagged `shared_domain` had its own `summary` field silently discarded in
favor of one fixed sentence, with no way to say anything more specific.

**Fix applied (your step 2's answer): no new state, no rules.ts change,
no new `ComplianceStatus` value, no D1 schema change.** Reused the
existing `summary` field (already piped through the whole system for
non-shared-domain tools) by flipping the two templates' logic to
`tool.summary || <generic fallback>` — falls back to the old sentence only
if a tool has no summary, so every other `shared_domain` tool (Amazon Q
Developer, Gemini) renders byte-identical to before, verified in the built
output. Updated `summary` for Copilot and v0 to state their specific
reason (source-staleness / never-product-scoped respectively) — `trains_
on_user_data`, `data_retention`, `gdpr_mentioned`, `opt_out_available`
untouched, exactly as instructed.

**Source URL updates:** Copilot's `source_urls` now points at
`support.microsoft.com/.../privacy-faq-for-microsoft-copilot` (the FAQ
page from the diagnosis below, the best available Copilot-specific
reference even though it's unverified). v0's stays at
`vercel.com/legal/privacy-notice` unchanged, per your instruction.

**Verified:** rebuilt the site (`astro build`), inspected the generated
HTML directly for `/tools/microsoft.com/`, `/tools/vercel.com/`, and the
`/tools` listing page — badge is `amber-outline` (dashed border) on both,
and the reason paragraph now shows the specific text, not the generic
sentence. Cross-checked `/tools/amazon.com/` (an unrelated shared-domain
tool) renders unchanged.

**Scope boundary I did not cross, flagging rather than assuming:** the
browser extension's popup reads its `summary` tooltip live from the
backend's D1 `tools` table, which is a completely separate data store from
`frontend/data/tools.json` (confirmed: the static site only ever reads the
JSON file at build time, per `README.md` and the frontend agent's own
charter — there's no live API call from the site, and no export/sync
script exists in either direction). Your constraint said don't touch D1
schema/migrations; I've also held off touching D1 *data* here, since (a)
`microsoft.com` isn't even in local dev D1 today (a pre-existing gap
logged separately below) and (b) unilaterally pushing new summary text
into D1 for just `vercel.com` while `frontend/data/tools.json` is already
a known-diverged snapshot felt like patching one edge of a bigger
sync problem rather than actually fixing it. The extension's badge *shape*
(outlined vs. solid) is generic per-status logic with no per-tool text at
all, so that part already renders correctly regardless — it's only the
tooltip wording that's frontend-only for now. Say the word if you want the
D1 rows updated too.

**Changelog:** one line added noting this is a display-text change only —
`compliance_status` value is unchanged for both tools, so this is not a
breaking change to `/v1/lookup`/`/v1/check` consumers (and in fact those
endpoints are unaffected either way, since they read D1, not `frontend/
data/tools.json` — confirmed by tracing `lookup.ts`, which never touches
the JSON file at all).

---

## Resolved (2026-09-01): Microsoft Copilot discrepancy diagnosed — root cause is a stale/redirected source URL, not extraction noise. Elliot's call applied above (marked unverified with a specific reason; source_urls updated to the FAQ page).

Follow-up investigation per your ask, before any Phase 2 bulk processing.

### 1. The two URLs, verbatim

- **Stored in `tools.json`'s `source_urls`:**
  `https://www.microsoft.com/en-us/microsoft-copilot/for-individuals/privacy`
- **Fetched by Task 2's fresh extraction:**
  `https://www.microsoft.com/en-us/microsoft-copilot/for-individuals/privacy`

**They are the exact same URL.** This is case 3 from your instructions, not
case 2 — not a stale-vs-current-URL mismatch in what's on file, but the
same URL producing different facts.

### 2. Stability check (case 3's instruction)

Fetched this URL twice, independently: byte-identical cleaned text both
times (6,589 chars). Ran `extractFacts` 3 more times on that identical
text (4 runs total counting Task 2's original). All 4 runs agree:
`trains_on_user_data: false`, `opt_out_available: true`,
`gdpr_mentioned: false`, every time, from the same clauses about "Copilot
in Microsoft 365 apps." **The extraction is stable, not noisy.** Per your
own instruction, that means the stored facts are the bug — but it's more
specific than that, and worth showing you the mechanism rather than just
the conclusion:

**The page at that URL is not the page the original facts describe.** Its
own content includes this line: *"Note: This article applies only to when
you're using Copilot in Microsoft 365 apps for home... For information
about privacy for the Microsoft Copilot app, see [Microsoft Copilot for
individuals: your data, privacy, and responsible AI]."* The URL's path
says `/for-individuals/`, but the content it currently serves is
explicitly about a *different* surface (Microsoft 365 apps for home) and
points readers elsewhere for the actual "for individuals" product. This
reads like a Microsoft docs-site restructure that repointed this URL's
content after the original extraction ran, not a research/curation error
on our side — `research/tool_sources.json`'s original notes on this tool
say plainly: *"Consumer Copilot (for individuals) product line, distinct
from Microsoft 365 Copilot enterprise product"* — i.e. this URL was
deliberately chosen to be the consumer-specific one, and today it isn't.

**Where the stored facts likely actually came from:** `research/
tool_sources.json`'s entry for this tool lists a third URL never
recorded in `tools.json`'s `source_urls` — `security_trust_page:
"https://support.microsoft.com/en-us/microsoft-copilot/privacy-faq-for-
microsoft-copilot"`. I fetched and extracted that page too:
`trains_on_user_data: true`, `opt_out_available: true`, `data_retention:
"By default, conversation activity stored for 18 months... files stored
securely for no longer than 18 months"` — this matches `tools.json`'s
stored `data_retention` text ("18 months for conversations by default...")
closely enough (down to the specific "18 months" figure and the Copilot
Vision reference elsewhere on that same FAQ page) that I'm confident this
FAQ page, not the URL on file, is what the original facts were drawn from.
**Complication:** that FAQ page itself opens with *"This article applies
only to the older version of the Microsoft Copilot app,"* and redirects
readers to a newer canonical page,
`https://support.microsoft.com/en-us/privacy/microsoft-copilot/overview`
("Microsoft Copilot for individuals: your data, privacy, and responsible
AI"). I fetched and extracted that one too — it's thin (5,567 chars, mostly
links out to the Microsoft Services Agreement and Privacy Statement rather
than stating facts itself): `trains_on_user_data: null`,
`data_retention: null`, everything null except `gdpr_mentioned: false`.

So there are three candidate URLs, three different fact sets, and none of
them is both current and fact-complete:

| URL | What it's about | Facts |
|---|---|---|
| `.../for-individuals/privacy` (on file now) | Copilot in M365 apps for home | `trains_on_user_data: false`, `opt_out: true` — stable across 4 runs |
| `.../privacy-faq-for-microsoft-copilot` (research's `security_trust_page`, not on file) | Standalone Copilot app, self-described as the **older** version | `trains_on_user_data: true`, `opt_out: true`, matches stored `data_retention` |
| `.../privacy/microsoft-copilot/overview` (the FAQ page's own redirect target, newest) | Standalone Copilot app, current version | everything `null` — too thin to extract facts from directly |

### 3-4. Recommendation (not applied — tools.json untouched)

This doesn't change the *public badge* either way — `shared_domain`
already forces `shared_domain_unverified` regardless of these facts — so
there's no urgency on the verdict. But the underlying data is currently
citing a URL that demonstrably isn't the source of its own stored facts,
which is a provenance problem worth fixing before Copilot (or anything
like it) goes through automated Phase 2 recheck logic that trusts
`source_urls` at face value.

My recommendation: update `source_urls` to the FAQ page
(`.../privacy-faq-for-microsoft-copilot`) since it's almost certainly the
real original source and is the only one of the three with complete,
extractable facts — and keep the existing stored facts as-is, since they
already match that page. The "older version" caveat on that page is a
judgment call I'd rather you make than assume: if you'd rather the record
reflect the *current* app version, the newest canonical page doesn't have
enough stated facts to support a confident extraction on its own right
now, which would push this tool toward `unrated`-quality data underneath
the `shared_domain_unverified` override rather than resolving it. Not
picking between these for you — flagging with the evidence.

### 5. Other `shared_domain`-flagged tools — checked for the same URL-ambiguity risk (no re-extraction run)

Checked each stored `source_url`'s own `<title>`/`<h1>` against the
product it's meant to represent, without re-running extraction on any of
them (per your constraint):

- **Gemini** (`https://support.google.com/gemini/answer/13594961`) — page
  title is *"Gemini Apps Privacy Hub - Gemini Apps Help"*. Clearly and
  specifically scoped to Gemini Apps. No ambiguity found.
- **Amazon Q Developer** (`https://docs.aws.amazon.com/amazonq/latest/
  qdeveloper-ug/service-improvement.html`) — page title is *"Amazon Q
  Developer service improvement - Amazon Q Developer."* Clearly scoped to
  the specific product. No ambiguity found.
- **v0** (`https://vercel.com/legal/privacy-notice`) — page title is
  simply *"Privacy Notice,"* with no product name anywhere in the title or
  the URL path. **This is the same class of problem as Copilot, arguably
  worse: it was never product-scoped to begin with** — it's Vercel's
  general company privacy notice, not anything specific to v0. Flagging
  for the same review before any Phase 2 automated handling of this entry.

---

## Resolved (2026-09-13, Phase 2.5i): Microsoft Copilot's stored facts contradict a fresh live re-extraction from the same source URL — source-page specificity problem, papered over (correctly, for the badge) by shared_domain but not for the underlying data

**Phase 2.5i finding:** the recommendation from the diagnosis entry above
("Microsoft Copilot discrepancy diagnosed") — update `source_urls` to the
FAQ page, keep the existing facts since they already match it — **was, in
fact, applied**, contrary to this pass's kickoff description of it as
"never applied." Evidence, chronological:

1. The "Resolved (2026-09-01): Copilot and v0 now show their specific
   unverified reason" entry above did the `source_urls` swap to
   `.../privacy-faq-for-microsoft-copilot` directly in `tools.json` — that
   entry's own text confirms this.
2. That fix predates the Phase 2 bulk run (same day, but this entry is
   further down the file / chronologically earlier — file is newest-first).
   The bulk run's fresh extraction of Microsoft Copilot came back clean
   enough to auto-publish (tier A, listed among the 10 auto-published tools
   in "Phase 2 bulk run complete" below) — consistent with it having
   re-fetched the now-corrected FAQ URL rather than the stale one.
3. Real D1 was populated from local D1 on 2026-09-06 (Task 1), carrying
   that row forward.
4. `frontend/data/tools.json`'s current Microsoft Copilot entry — produced
   by regenerating straight from real D1 on 2026-09-07 — shows
   `source_urls: [".../privacy-faq-for-microsoft-copilot"]` and facts
   matching that page exactly (`trains_on_user_data: true`,
   `data_retention` citing 18 months, matching the diagnosis below almost
   verbatim). If the stale `/for-individuals/privacy` URL or its facts
   were still in real D1, this regenerated file would show that instead.

**Not independently re-verified against a live real-D1 query** (outside
this pass's `--remote` constraint) — this is drawn from the documented
chain above plus the regenerated file's content, not a fresh `SELECT`.
Since `shared_domain` already hard-overrides the public verdict regardless
of these facts (confirmed in the diagnosis below), there was never any
badge-correctness risk either way. No code or data change made here —
tracing this fully is the entirety of Phase C item 2's ask.

---

Phase 1's Task 2 asked me to run 3 real tools through the live extraction
pipeline as a manual-verification sample: DeepL, Otter.ai, and Microsoft
Copilot (the shared-domain case). DeepL and Otter.ai's fresh extractions
matched both the existing catalog entry and my own read of the pages —
Microsoft Copilot didn't.

`tools.json`'s stored entry for `microsoft.com`: `trains_on_user_data:
true`, `data_retention: "18 months for conversations by default; up to 30
days for uploaded files..."` — this reads like consumer Copilot chat
history retention.

My fresh run against the exact same stored `source_url`
(`https://www.microsoft.com/en-us/microsoft-copilot/for-individuals/privacy`)
today: `trains_on_user_data: false`, `opt_out_available: true`, sourced
from clauses like *"Prompts, responses, and your file contents when using
Copilot in Microsoft 365 apps aren't used to train foundation models"* and
*"Your personal data collected from the use of connected experiences in
Microsoft 365 isn't used to train large language models"*. That's a page
about the Microsoft 365 app-integration surface of Copilot, not the
consumer chat product the 18-month retention figure sounds like it's
describing — I did not see an 18-month figure anywhere in what I fetched.

I did not touch `tools.json` or re-publish anything — this is a fact
mismatch to investigate, not a mine to silently resolve, especially since
`computeVerdict`'s `shared_domain_unverified` override means the *public
badge* is identical either way (this is exactly the override's job: no
apex-domain company's facts are trusted regardless of how clean they look).
But the underlying stored facts still disagree with a fresh pull of the
same URL, which matters for whatever eventually resolves the shared-domain
cases into real per-product verdicts.

Two live hypotheses, not resolving between them:
1. The original extraction was run against a **different** Microsoft
   Copilot privacy page (a consumer/`copilot.microsoft.com` surface) and
   `tools.json`'s `source_urls` field was updated to the current
   `/for-individuals/privacy` URL afterward without re-running extraction
   against it — a provenance drift between "URL on file" and "URL actually
   extracted from."
2. Microsoft's own privacy page changed content between the original
   extraction and today.

Either way, this is a live example of why `shared_domain` apex-domain
companies are genuinely hard to source cleanly — a single large company
can have multiple, contradictory privacy surfaces for the "same" product
depending on which specific page/product-tier is cited, and the
shared_domain override exists precisely because no one page can be trusted
to speak for the whole company. Not proposing a fix here, just flagging
the concrete evidence since Elliot said not to silently patch this kind of
thing.

---

## Resolved (2026-09-01): Firefox badge bug — manifest fix confirmed working by Elliot's manual click-through

Phase 1 kickoff asked me to diagnose "popup shows Checking… indefinitely,
badge never resolves" in Firefox, following a specific order: read the
actual background/popup console error, check whether the network request
even fires, check permission scope, check CORS/wrangler reachability, and
only then consider a structural Firefox MV3 incompatibility.

**What I could verify by automated means, and did fix:**

- `extension/manifest.json` was missing `browser_specific_settings.gecko.id`
  and `data_collection_permissions` — both now mandatory for Firefox MV3
  add-ons. `web-ext lint` flagged this as an `ADDON_ID_REQUIRED` **error**
  (not a warning). Added a stable id (`policypeek@builtbyink.com`) and
  `data_collection_permissions: { required: ["none"] }` (accurate — nothing
  is collected). Re-ran `web-ext lint`: 0 errors/warnings.
- Used `web-ext run` to actually launch real Firefox (140.13.0esr, this
  machine's installed version) with the extension loaded via Firefox's
  remote debugger protocol: it installs cleanly as a temporary add-on, no
  errors at install time. Before the fix, I can't say whether this
  particular defect alone would have blocked a temporary install (Firefox
  has historically auto-generated an id for temporary/dev installs; this
  requirement reads more like an AMO-submission/signing gate) — so I'm not
  claiming this was necessarily *the* cause of the reported hang, just that
  it's a real, now-fixed defect either way.
- Verified the backend independently of the extension: `GET /v1/lookup` on
  local `wrangler dev` returns a correct `404 not_found` with proper
  `cors.ts` headers (`Access-Control-Allow-Origin: *`, etc.). This rules
  out "request fires but backend/CORS rejects it" and "wrangler dev isn't
  reachable" as the cause.
- Read `popup.js`/`config.js`/`badgeCopy.js`/`manifest.json` line by line
  for Chrome-only API usage (the usual Firefox MV3 gap). Nothing jumped
  out: `chrome.action.setIcon/setTitle`, `chrome.storage.local`,
  `chrome.tabs.query`, and ES-module popup scripts are all supported in
  current Firefox MV3. No background script exists in this extension at
  all (SCOPE.md describes one; the actual scaffold doesn't have one — see
  note below), so service-worker-lifecycle divergence isn't in play either.

**What I could not do, and why:** the instructions ask me to open
`about:debugging`, read the real console error, and manually click through
two test sites. This needs clicking a real browser toolbar icon and reading
a real console. This environment has a working X display (`DISPLAY=:0`,
confirmed via `xset q`) but no input-automation tool for it — no
`xdotool`/`xte`, no root or working `pip`/`apt` to install one, and no
Puppeteer/Playwright/geckodriver already present. I did not fabricate a
"verified working" result to satisfy the done-criteria — I'm flagging the
gap instead, per the charter's instruction to log a hit permission/tooling
wall rather than wait for a rubber stamp.

**Ask (resolved):** Elliot did the manual check. First result: deepl.com
correctly resolved to `not_compliant` (matches the catalog) instead of
hanging — confirms the manifest fix was the real cause. Second round
surfaced two more things that looked like bugs but weren't:
openai.com/grammarly.com showed "not in catalog yet" because the local
dev D1 only has a 13-tool subset seeded (not the full 33-tool published
catalog — neither domain is in the local `tools` table, confirmed via
`wrangler d1 execute --local`), and "already used today's free check" is
the real IP-based daily cap correctly firing after his first check
attempt. Redirected him to kagi.com/you.com (both in the local 13-tool
set, both `compliant`) — both came back correctly green. Done-criteria
met: one non-green (deepl.com, red) and one green (kagi.com/you.com) both
resolve correctly. No further action needed on the extension itself.

**Side finding, separate from this bug:** local dev D1 (`policypeek-db`
via `wrangler dev --local`) only has 13 of the 33 tools in
`frontend/data/tools.json` — it's a stale/partial seed, not the current
published catalog. Not fixing this now (out of Phase 1 scope, and
reseeding local dev data is a call about which snapshot should be the
source of truth), just flagging so the next person testing locally isn't
confused by "not in catalog" results for tools that are actually
published.

**Side note, not blocking:** `extension/SCOPE.md` describes a passive
background-service-worker design (listens to `tabs.onUpdated`/`onActivated`,
broad `<all_urls>` host permission) that was never built — the actual
`manifest.json`/`popup.js` scaffold is a simpler popup-only, click-triggered
design (`activeTab` + a single `localhost:8787` host permission). That's a
reasonable, smaller-permission-footprint choice, but it's a real divergence
from the written scope doc that nobody seems to have logged — flagging so
it doesn't look like an oversight later. Not treating it as in-scope for
this bug fix.

---

## Open, blocks further catalog growth (2026-08-18 night): `/about`'s "a human reviews it" claim doesn't match actual practice

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

## Fixed (2026-08-18): DNS-resolution SSRF bypass in `ssrf.ts` (security review finding #1) — DoH pre-check landed, full IP-pinning not achievable in this runtime, logging the residual gap rather than leaving it silent

Security Agent's `security/review-2026-08-18.md` High finding: `assertSafeUrl`
only ever inspected the literal hostname/IP string in a submitted URL, never
the address DNS actually resolves it to. A wildcard-DNS hostname like
`169-254-169-254.nip.io` isn't itself a blocked literal, so it sailed
straight through and resolved to the cloud metadata address
(`169.254.169.254`) at `fetch()`-time — full SSRF bypass, and the same gap
applied to every redirect-hop revalidation (classic DNS-rebinding TOCTOU).

**Fix applied, in my own lane per the charter (SSRF wrapper is Backend
Agent's ownership, this is a bug fix not a scope change):** `ssrf.ts` now
resolves every non-literal hostname via DNS-over-HTTPS (Cloudflare's
`cloudflare-dns.com/dns-query` JSON endpoint — a fixed, hardcoded host, not
attacker-influenced input, so it's called via plain `fetch()`, not routed
back through this same wrapper) before every connection attempt — the
initial URL and every redirect hop, not just the first — and rejects if
*any* returned A or AAAA answer is private/link-local/loopback/metadata
(reject-if-any-bad, not reject-if-first-bad, since a multi-answer response
can rebind on a later answer). DNS resolution failing/erroring is treated as
blocked (fail closed), not silently skipped.

**Residual risk, explicitly accepted rather than left undocumented:**
Cloudflare Workers' `fetch()` gives no hook to pin the exact IP a request
actually connects to — there's no way, from inside a Worker, to force the
runtime's own subsequent DNS resolution inside `fetch()` to reuse the
address our DoH pre-check just validated. This closes the primary attack the
finding describes (a submitted hostname that resolves to a blocked address
via ordinary/attacker-controlled-but-static DNS), but it cannot fully close
classic DNS-rebinding TOCTOU: a malicious authoritative zone with a very low
TTL could in principle return a safe IP to the DoH pre-check and a different,
blocked IP microseconds later when `fetch()` does its own resolution. True
IP-pinning isn't achievable in the Workers runtime today as far as I can
tell — flagging this here per the review's own proposed framing ("or
explicitly log this as an accepted residual risk") rather than silently
shipping a fix that looks complete but isn't. If a future Workers runtime
feature exposes a connect-time IP hook, this should be revisited.

Also added: a lookalike-suffix regression test for the cross-domain
allowlist (`check.test.ts` — `evilstackblitz.com` / `stackblitz.com.evil.com`
vs. `bolt.new`, confirming the existing dot-boundary logic already rejects
both, per the review's low-severity finding #3) and 8 new `ssrf.test.ts`
cases covering the DoH pre-check itself (safe resolution, blocked-via-DNS,
multi-answer reject-if-any-bad, AAAA-only block, fail-closed on resolver
error, redirect-hop re-resolution, and literal-IP hostnames correctly
skipping DNS entirely). Full suite: 59/59 passing (was 51 before this
change), `tsc --noEmit` clean. Did not touch `crossDomainSources.ts` or any
of the other uncommitted working-tree changes the review's finding #2 flags
as a separate process item — that's not mine to resolve.

---

## Published (2026-08-18): Amazon Q Developer and DeepL, per Elliot's live go-ahead on `research/deep_dive_amazonq_speechify_deepl.md`

Elliot reviewed the research pass live and approved publishing 2 of the 3
tools it unblocked. Both had existing `pending_checks` rows from the second
batch (id 2 for Amazon Q / amazon.com, id 21 for DeepL / deepl.com) — updated
`extracted_facts`, `source_url`, and `name` on those rows with the research
file's exact facts/quotes/sources, then ran them through the real
`POST /v1/admin/pending/:id/approve` endpoint against a local `wrangler dev`
instance (not a direct DB write for the verdict step) so `computeVerdict`
and both `compliance_changelog` triggers (insert + update) actually executed
rather than being assumed correct. `npm test` (48 tests, 12 files) passes
after.

**DeepL**: `trains_on_user_data: true`, `opt_out_available: false` -> 
`not_compliant` (confirmed via the live approve call, matches
`rules.ts::computeVerdict`'s `not_compliant` branch — trains by default, no
opt-out). Sources: deepl.com/en/privacy + deepl.com/en/terms-of-use, both now
in `tools.source_urls`. Set `tools.summary` directly to the exact tier-caveat
sentence from the research file's "Suggested badge summary" section — this
is the one entry in the catalog whose `summary` is a composed sentence
rather than a raw `relevant_clauses[0]` quote (every other tool's summary is
literally the first extracted quote — see `admin.ts::approvePendingCheck`).
Diverging here was an explicit instruction from Elliot (via the research
file) because no single quote captures the free/Pro tier contrast cleanly;
flagging the inconsistency rather than pretending `approvePendingCheck`
grew a new summary-override feature — it didn't, this was one direct
follow-up `UPDATE` after the normal approve call, not a code change.

**Amazon Q Developer**: `trains_on_user_data: true`, `opt_out_available: true`
(Free tier; Pro/Q Business never trains, noted in the underlying facts but
not in the public summary — see below). Sources: the two dedicated AWS docs
pages from the research file (`.../service-improvement.html` and
`.../opt-out-IDE.html`), replacing the old generic AWS Privacy Notice URL
that was too broad to answer either fact.

**Shared-domain call, made explicitly rather than left ambiguous**: kept
`shared_domain = 1` on the amazon.com row, so it published as
`shared_domain_unverified` (verdict confirmed via the live approve call),
*not* `compliant_with_caveats` as the task's tentative framing suggested it
might. Reasoning: `sharedDomains.ts`'s flag is about whether the apex domain
(`amazon.com`, matched via `suffixCandidates` against every `*.amazon.com`
subdomain a visitor might be on) hosts more than one company's products —
it's a domain-identity question, not a source-quality one. Finding a
dedicated, well-sourced Amazon Q Developer docs page answers "are the facts
good" but not "is amazon.com exclusively Amazon Q Developer's." Direct
precedent already in the catalog: Gemini (`google.com`) and Microsoft
Copilot (`microsoft.com`) both have dedicated, product-specific source pages
(`support.google.com/gemini/...`, `microsoft.com/.../microsoft-copilot/...`)
and are still correctly flagged `shared_domain_unverified` — a
product-specific *source page* has never been treated as resolving the
apex-domain-sharing concern anywhere else in the pipeline, so making an
exception for Amazon Q Developer would have been inventing new logic on the
fly rather than applying the existing rule. Facts are still updated
accurately in `tools.trains_on_user_data`/`opt_out_available` for the
record (matches the Gemini/Copilot/v0 pattern of real facts + overridden
summary), but the public `summary` field is the standard shared-domain
canned sentence, not the free/Pro tier-caveat text drafted for the
(not-taken) `compliant_with_caveats` outcome — same as every other
shared-domain entry, no exception invented.

Both now live in `frontend/data/tools.json` (catalog is 31 tools, up from
29), inserted in alphabetical position to match the file's existing sort
order.

**Speechify** — left untouched exactly as instructed: still `extracted`
status in `pending_checks` (id 17), `trains_on_user_data`/`opt_out_available`
still `null`, not published. No natural admin-facing note field exists on
`pending_checks` (schema has no notes/comment column, and adding one for a
single one-off case felt like overreach for this task) — this entry in
`DECISIONS_NEEDED.md` is that note. Anyone reviewing pending id 17 should
read `research/deep_dive_amazonq_speechify_deepl.md`'s Speechify section
before re-litigating why it's null: the ambiguity is real (the operative
"improve the features/algorithms... commercially benefit" language in
Speechify's ToS is broad enough to cover AI training but never actually
says "train"/"AI"/"model" the way the one clause that does use that
language — the Google Workspace carve-out — does), not a research gap.

## Update (2026-08-18): third research batch sourced, 17 tools, not yet piped

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

## For review whenever convenient (2026-08-17): 4 items from the second research batch — 3 of 4 now resolved, see status notes

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

## Update (2026-08-18): Windsurf's Wayback fallback worked live; Adobe Firefly's diagnosis has changed — revises the "Confirmed" entry below

Follow-up to the "Confirmed, not just suspected (2026-08-17)" entry
immediately below and the "Ran overnight" entry above (which noted
archive.org itself rate-limited last session's outbound IP, so the Wayback
fallback was built and unit-tested but not yet proven against these two
specific domains).

**Windsurf: resolved, sitting in review.** The Wayback fallback
(`waybackFallback.ts`) found a real archive.org snapshot for Windsurf's
terms and correctly ran it through the pipeline — `sourced_from_archive`
forces a human-queue result rather than auto-publishing (per
`evaluateAutoPublish`'s own rule), so it's sitting in `pending_checks` as
id 23, not live. Needs your review, not further engineering.

**Adobe Firefly: diagnosis revised, not fixed.** Last session's belief was
a transient IP-based rate-limit on archive.org's availability API. Tonight's
interleaved control test says otherwise: hitting archive.org for Windsurf's
URL from the same outbound IP in the same session succeeded, while every
Adobe URL variant tried against archive.org got a 429. That rules out "our
IP is generically rate-limited right now" — it looks like archive.org
itself specifically throttles or blocks requests for adobe.com content
(plausible reasons not confirmed: a robots.txt exclusion Adobe has asked
archive.org to honor, or Adobe's own edge blocking archive.org's crawler
historically, leaving few/rate-limited snapshots to begin with). **This
changes the recommendation from "retry later" to "needs a different
strategy, or Adobe Firefly stays absent from the catalog."** No further
retries planned without a new approach (a different archive source, or
accepting the gap) — repeating the same 429 isn't new information.

---

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

**Superseded in part — see the "Update (2026-08-18)" entry above.** The
proposed-fallback idea below (pull the last Wayback Machine snapshot) was
built and has now worked live for Windsurf (`pending_checks` id 23, awaiting
your review). Adobe Firefly's underlying cause has also since been narrowed
further (archive.org itself throttling/blocking `adobe.com` specifically,
not our checker or a generic rate limit) — read the 2026-08-18 entry above
before treating either line below as still the latest word.

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

**Status: resolved (2026-08-17), see "Resolved (2026-08-17): three-tier
auto-publish is live" above.** Elliot's confirmed answer was apex domain +
`shared_domain_unverified` as the honest verdict, now wired into the
pipeline automatically via the curated list in `sharedDomains.ts` rather
than requiring a human to set the flag by hand. A related but distinct
follow-up question — products whose real policy lives on a genuinely
*different* domain than the product itself, not a shared corporate domain —
got its own mechanism 2026-08-18 (`crossDomainSources.ts`, used for
Bolt.new/StackBlitz); Devin/Cognition/Windsurf is a fresh, harder instance
of that second question, not yet resolved — see the "third research batch"
entry near the top of this file.

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

**Status: resolved (2026-08-18).** Elliot ruled this case gets its own
bucket, `compliant_with_caveats`, rather than folding into plain
`compliant` as milestone 6's silent interpretation had done — GDPR
generally wants opt-in, not opt-out-if-you-find-it. Implemented in
`rules.ts::computeVerdict`, `schema.sql`'s `compliance_status` CHECK
constraint, the badge UI (`Badge.astro`), the methodology page
(`about.astro`), and now documented as one of the five canonical verdict
buckets in `CLAUDE.md`. See the "Fixed"/"Published" entries dated
2026-08-18 near the top of this file for what shipped alongside it.

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

**Resolved (2026-09-13):** Elliot confirmed the production domain as `getpolicypeek.com`. `frontend/astro.config.mjs` and `frontend/public/robots.txt` updated accordingly. Still does not touch DNS, deployment, or `wrangler.toml` routes — the actual custom-domain setup at the Cloudflare level remains a separate, still-blocked Phase 3 step.

---

## FYI, not urgent: light competitive scan

Three tools doing roughly what PolicyPeek does, for context when you get to pricing (not asking you to decide anything now):

- **[ToS;DR](https://tosdr.org/en)** — the closest architectural match: a pre-built, curated database you look up a service in and get a letter grade (A–E) plus per-clause reasoning. Free, donation-funded, volunteer/peer-reviewed instead of an admin-approval pipeline. This is the "prior art" for PolicyPeek's whole model.
- **[Termzy AI](https://www.termzyai.com/)** — Chrome extension, analyzes whatever policy page you're currently on in real time (not a pre-built database), scores across 4 dimensions. Free, fully client-side (no server, no stored data) — different trust model than PolicyPeek's server+D1 approach.
- **[TrustScan](https://trustscan.dev/)** — web tool, paste a URL or policy text, get a plain-English summary. Free, no account, explicitly "no premium tiers," processing stays in-browser.

Pattern worth noting: everything I found in this exact niche is free (no paywall on the core lookup/analysis). The paid enterprise-compliance tools that came up in search (Centraleyes, Credo AI, Termly) are a different market — they're for companies proving *their own* regulatory compliance (EU AI Act, GDPR-doc-generation), not for end users checking whether *someone else's* tool trains on their data. Not sure if that changes your pricing thinking, just flagging it since it's the first real market signal we have.

