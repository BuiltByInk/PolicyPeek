# Decisions Needed

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

## Open (2026-09-01): Microsoft Copilot's stored facts contradict a fresh live re-extraction from the same source URL — source-page specificity problem, papered over (correctly, for the badge) by shared_domain but not for the underlying data

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

---

## FYI, not urgent: light competitive scan

Three tools doing roughly what PolicyPeek does, for context when you get to pricing (not asking you to decide anything now):

- **[ToS;DR](https://tosdr.org/en)** — the closest architectural match: a pre-built, curated database you look up a service in and get a letter grade (A–E) plus per-clause reasoning. Free, donation-funded, volunteer/peer-reviewed instead of an admin-approval pipeline. This is the "prior art" for PolicyPeek's whole model.
- **[Termzy AI](https://www.termzyai.com/)** — Chrome extension, analyzes whatever policy page you're currently on in real time (not a pre-built database), scores across 4 dimensions. Free, fully client-side (no server, no stored data) — different trust model than PolicyPeek's server+D1 approach.
- **[TrustScan](https://trustscan.dev/)** — web tool, paste a URL or policy text, get a plain-English summary. Free, no account, explicitly "no premium tiers," processing stays in-browser.

Pattern worth noting: everything I found in this exact niche is free (no paywall on the core lookup/analysis). The paid enterprise-compliance tools that came up in search (Centraleyes, Credo AI, Termly) are a different market — they're for companies proving *their own* regulatory compliance (EU AI Act, GDPR-doc-generation), not for end users checking whether *someone else's* tool trains on their data. Not sure if that changes your pricing thinking, just flagging it since it's the first real market signal we have.

