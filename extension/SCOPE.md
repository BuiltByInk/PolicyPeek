# Browser Extension MVP — Scope

Status: **scope only, no code yet.** Per instructions, `manifest.json` and
extension code are blocked until this doc is reviewed and approved.

## Goal

Surface a tool's badge passively while the user browses, so the free-tier
individual/casual-checker ICP (see `CLAUDE.md`'s "Business Model & ICP")
never has to visit the site to get a verdict. Secondary goal: turn
uncatalogued sites into `POST /v1/check` submissions, since that's the
catalog's growth loop.

## Non-goals (MVP)

- No account/login UI (see "Auth model" below for why this is a real
  question, not just a UI simplification).
- No org/team features — matches the decided ICP.
- No on-page injected UI (banners, overlays) — toolbar icon + popup only.
- No automatic privacy-policy-page discovery (crawling a site's footer
  for the policy link). MVP relies on the user being on a page under the
  target domain when they click "Check this site" — see the growth-loop
  section.
- Firefox: stretch goal, not a blocker for MVP. Manifest V3 (Chrome/Edge)
  is the target; Firefox's MV3 support is close enough that most of this
  should port, but it isn't being built or tested for MVP.

## Trigger & data flow

1. Background service worker listens for tab navigation
   (`chrome.tabs.onUpdated` with `changeInfo.status === "complete"`, and
   `chrome.tabs.onActivated` for switching to an already-loaded tab).
2. On each event, read `tab.url`, extract the hostname.
3. Call `GET /v1/lookup?domain=<hostname>` (no API key needed — confirmed
   in `backend/src/auth.ts::resolveTier`, a missing key already resolves
   to `"free"` rather than erroring, so this matches the "no account
   needed for free tier" goal for the *lookup* half of the extension).
4. Backend already does the subdomain suffix-walk
   (`backend/src/lookup.ts::suffixCandidates`) — the extension sends the
   full hostname as-is and doesn't need its own domain-matching logic.
5. Response drives the toolbar icon state (below). Cache per-hostname
   per-tab-load to avoid refetching on every SPA route change within the
   same domain — exact cache invalidation (TTL vs. session-only) is an
   implementation detail for the build phase, not a scoping decision.

## Permissions — the passive-badge tension

Flagging this because it directly affects whether "passive, no click
required" is achievable without a scary install prompt, not because it's
undecided — I have a recommendation.

Reading `tab.url` automatically (not after a user gesture) requires
either the broad `"tabs"` permission (Chrome's install prompt shows this
as *"read your browsing history"*) or `host_permissions` matching the
pages the extension runs on. `"activeTab"` alone doesn't work here — it
only grants access after an explicit user action (click), which defeats
"passive."

**Recommendation:** a content script matching `<all_urls>` that reads
`location.hostname` and messages it to the background worker, rather than
the background worker reading `tab.url` directly via the `"tabs"`
permission. Same effective breadth (`host_permissions: ["<all_urls>"]`),
but Chrome's install-time framing for "runs on all websites you visit" is
generally a smaller install-conversion hit than "read your browsing
history" for a bottom-up, zero-users-yet product — worth confirming this
still holds by checking the current Chrome Web Store listing copy at
scaffold time, permission-prompt wording does drift between Chrome
versions.

Either way: this is a real, broad permission grant every install has to
accept. Worth Elliot seeing that explicitly before scaffolding, not
burying it in a manifest file.

## Badge / icon states — reuse the site's visual language

Source of truth: `frontend/src/components/Badge.astro` and
`frontend/src/layouts/Layout.astro`'s CSS variables. Do not invent new
colors or a new shared_domain_unverified treatment — port the existing
one.

| State | Site badge treatment | Extension icon treatment |
|---|---|---|
| `compliant` | solid green fill (`--green-fg #1e7a34` light / `#6fe39a` dark) | solid green dot/badge |
| `not_compliant` | solid red fill (`--red-fg #b3261e` / `#f28b82`) | solid red dot/badge |
| `unrated` | solid amber fill (`--amber-fg #92600a` / `#f2c14e`) | solid amber dot/badge |
| `shared_domain_unverified` | **outlined**, not solid — this distinction was a deliberate accessibility fix (shape, not just color, per the earlier badge-review pass) | hollow/ring amber icon variant, same color, **not** a solid amber dot — a color-only difference at toolbar-icon size (16–19px) would be even less distinguishable than at badge size, so the shape rule matters *more* here |
| not in catalog (`404 not_found` from lookup) | no equivalent on the site (site only lists catalogued tools) | new, extension-only: neutral/gray icon state |

Tooltip/title text on hover should reuse the exact site copy per state
(e.g. `"Company-wide policy"` for
`shared_domain_unverified`, pulled from `Badge.astro`'s `copy` map) rather
than writing new wording — keeps the two surfaces consistent and avoids
re-litigating label copy in a second place.

`chrome.action.setIcon` (distinct icon assets per state, carrying the
solid-vs-outline shape) plus `chrome.action.setTitle` (tooltip text) is
the mechanism; `setBadgeText`/`setBadgeBackgroundColor` alone isn't
enough on its own since a single-color badge dot reintroduces the
color-only problem the site fix was written to avoid.

## "Not in catalog" state — the growth-loop entry point

When `/v1/lookup` returns `404 not_found`, the popup shows a "Check this
site" button instead of silently doing nothing, per the instructions.

Clicking it calls `POST /v1/check` with `domain` = the current hostname
and `source_url` = the **current tab's URL** (not a discovered
privacy-policy link — see "Non-goals"). This means check quality depends
on the user being on the actual policy page when they click, not just
anywhere on the domain. MVP handles this honestly rather than pretending
it's smarter than it is: the popup copy should say something like *"For
best results, click this from the site's privacy policy page"* rather
than implying the extension will find the policy page itself. A future
iteration could try common paths (`/privacy`, `/legal/privacy`, footer
link scanning) — explicitly out of MVP scope, not silently deferred.

`isSourceHostAllowedForDomain` (`backend/src/check.ts`) already requires
`source_url`'s host to equal or be a real subdomain of `domain`, so
submitting the current tab's own URL as `source_url` naturally satisfies
that check without extra client-side validation.

## Auth model — RESOLVED 2026-08-15, see below

**Update:** this gap is closed. `POST /v1/check` now degrades a
missing/invalid key to `"free"` via `resolveTier`, same as
`GET /v1/lookup` — option 1 below, not option 2. No self-service key
issuance was added or needed. Rest of this section kept as the record of
what was checked and why; still accurate as history, just no longer an
open blocker.

The instructions state: *"No account/login required for free tier — API
key only needed to raise the daily check cap or unlock premium fields."*
I checked this against the current backend rather than assuming it
already works that way, and **it doesn't, for the check half:**

- `GET /v1/lookup`: confirmed anonymous-friendly today.
  `resolveTier` (`backend/src/auth.ts`) already defaults a missing key to
  `"free"` rather than rejecting. No extension change needed here.
- `POST /v1/check`: **currently requires *some* valid, registered API
  key outright** — `requireApiKey` returns `null` (→ `401`) on a missing
  key, full stop, regardless of tier (`backend/src/check.ts:50-53`,
  `backend/src/auth.ts:33-44`). There is no anonymous/free path into this
  endpoint today, and no self-service key-issuance endpoint exists
  anywhere in `backend/src/index.ts` — every `api_keys` row that exists
  today was created directly in D1, not through any API.

So "no login required" for the *lookup* badge is already true in the
backend as it stands. "No login required" for the *check* action (the
actual growth-loop button) is **not** true yet, and closing that gap is
a backend-scope decision, not something I can quietly assume or design
around on the extension side. Two shapes it could take, not choosing
between them here:

1. **Backend allows anonymous `/v1/check`** — e.g. free-tier default
   already exists in `resolveTier`; `handleCheck` could accept that
   instead of hard-requiring a key, with abuse control shifted to
   IP-based or install-id-based limiting instead of key-based.
2. **Extension self-provisions an anonymous free-tier key per install**
   (no human-visible signup, but still uses the existing SHA-256 key
   mechanism) — requires a new backend endpoint to mint a `free`-tier key
   on request, which doesn't exist today either.

Either is a legitimate design, but both require new backend surface
area that's Backend Agent's call, not mine, and directly gates whether
the "Check this site" button in this scope doc can work at all in an MVP
where "no login required" is a hard requirement. **Flagging, not
deciding.**

## Daily check cap — RESOLVED 2026-08-15, see below

**Update:** real server-side enforcement now exists —
`backend/src/rateLimit.ts`, 1 check per rolling 24h window keyed by
`CF-Connecting-IP` (`anonymous_check_log` table). Paid-tier keys are
exempt. See `DECISIONS_NEEDED.md` for the shared-IP/CGNAT/VPN tradeoff
that identity choice carries — flagged there, not silently resolved.
Rest of this section kept as the record of what was checked; still
accurate as history, just no longer an open blocker.

The instructions ask the extension to respect "the free tier's 1-new-
check-per-day cap." I checked for this and **it does not exist in the
backend today** — no rate-limiting table, no per-key/per-IP counter
anywhere in `schema.sql` or `backend/src/*.ts`. `POST /v1/check` has no
throttle at all currently beyond requiring a valid key.

A cap enforced only client-side (e.g. a timestamp in `chrome.storage`) is
UX-only, not a real control — trivially bypassed by reinstalling the
extension or clearing storage, and doesn't protect the backend's actual
cost driver (the outbound fetch + Haiku extraction call per check). If
real enforcement matters before this ships, it needs to live
server-side, most naturally keyed off whatever identity the "Auth model"
gap above resolves to (anonymous key or install-id). Same call as above:
**flagging as a backend dependency, not deciding it, not faking it
client-side.**

## Decisions needed before/alongside scaffolding

1. **API target** — still open: does the extension call the live
   Cloudflare Worker (not deployed yet — deployment is deliberately
   parked per `CLAUDE.md`) or a local dev target (`wrangler dev`, e.g.
   `localhost:8787`) for now? This determines whether extension work can
   start in parallel with continued local backend dev, or is blocked on
   a deploy decision that's explicitly off-limits to every agent without
   Elliot lifting it. This is now the only remaining blocker from this
   doc.
2. ~~Anonymous `/v1/check` access~~ — resolved, see "Auth model" above.
3. ~~Daily-cap enforcement location~~ — resolved, see "Daily check cap"
   above.

## Target platform

- Manifest V3, Chrome/Edge (shared engine, same manifest largely works
  for both).
- Firefox: stretch goal per instructions, not attempted or tested in
  MVP scaffolding.

## Not scoped here (deferred to the build-phase plan, post-approval)

- Exact icon asset production (SVG sources, sizes: 16/32/48/128).
- Popup UI layout details beyond "shows the badge state + Check this
  site button when uncatalogued."
- Options/settings page for entering a paid API key to raise limits /
  unlock premium fields (mentioned in instructions as something a key
  unlocks, but designing that UI is build-phase, not scope-phase).
- Build tooling / bundler choice for the extension itself.
