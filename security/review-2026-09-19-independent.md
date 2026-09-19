# Independent security review, 2026-09-19

Scope: the 2026-09-19 backend/src changes (redirects, global ceiling, IPv6 /64 keying, input caps, alerting, purge cron, SSRF additions), plus sharedDomains.ts and lookup.ts. Read-only. Backend tests: 16 files, 116 tests pass. URL-parser and IPv6 behaviour was checked with local node snippets only; nothing was fetched.

The two HIGH findings are stops under the charter. Both are pre-existing gaps that the session's own review did not flag.

## HIGH

### H1. Shared-domain override is defeated by `www.` or any subdomain
- `sharedDomains.ts:25-27` is an exact-set match; called at `check.ts:342` and `cron.ts:98`.
- Scenario: submit `www.adobe.com`, `gemini.google.com` or `www.apple.com` with a source on that host. It is not "known shared", so `computeVerdict` gives a product-specific verdict and it auto-publishes.
- This is the ordinary extension path, not just an attack. The popup submits the tab hostname (`extension/popup.js:153`). The catalog only holds shared rows for amazon, google, microsoft and vercel. On `www.adobe.com` or `www.apple.com`, lookup 404s, the button appears, and a click publishes a specific badge the curated list says must never exist.
- Fix: make `isKnownSharedDomain` true when `d === k || d.endsWith("." + k)`, after lowercasing and stripping a trailing dot. Tests: `www.adobe.com` and `gemini.google.com` true; `notgoogle.com` false.

### H2. Public suffixes and hosting apexes can be registered, and lookup inherits them
- `lookup.ts:21-23` accepts `co.uk`, `github.io`, `vercel.app`, `pages.dev`, `notion.site`. `check.ts:55-58` accepts any source host under the submitted domain. Only `vercel.com` is in the shared list.
- Scenario: an attacker makes `attacker.github.io` saying "we never train on your data" and submits domain `github.io` with that source. Nothing needs to be owned. It auto-publishes "compliant". `lookup.ts:25-35,80` walks parents, so every `*.github.io` site without its own row inherits it in `/v1/lookup`, the extension and the site. `co.uk` does the same to every UK site.
- Related: a real published tool such as `acme.com` with tenant subdomains. A page at `tenant.acme.com` with the same verdict silently replaces `summary`, `source_urls` and `data_retention`, because only verdict flips queue. The redirect rule accepts the same subdomains.
- Fix:
  1. Bundle the Public Suffix List (private section included, or `tldts`); reject a submitted domain that is a public suffix.
  2. In `suffixCandidates`, drop public-suffix candidates so lookup stops at the registrable domain.
  3. In `runExtraction`, queue when an existing row's stored source host differs from the new one.
- Elliot should also run a read-only D1 query for existing rows whose domain is a suffix.

## MEDIUM

### M1. One actor can exhaust the global ceiling
- `rateLimit.ts:27,62-86`, `auth.ts:61-66`. The cap is 200 a day, keyed on an IPv6 /64.
- A free tunnel-broker /48 holds 65,536 /64s. About 200 requests, each with a fetchable page, block everyone with `daily_capacity_reached` until 00:00 UTC.
- Fix: key on /48 or /56, add a per-registrable-domain cap of one check a day, and add an edge rate-limit rule on `POST /v1/check`.

### M2. Release-on-failure gives unlimited outbound fetches
- `check.ts:268-271`, `rateLimit.ts:93-97`. Every failure after reservation returns the slot.
- The domain need not be owned; only the source host must match it. A caller can loop `domain=victim.com, source_url=https://victim.com/x` uncapped. Each loop costs the Worker up to 6 hops at 20 s, 2 DoH calls per hop, and on a non-SSRF error an archive.org lookup plus snapshot fetch. This is a free GET reflector on PolicyPeek's egress.
- Fix: add `fail_count` to `anonymous_check_log` (migration; needs Elliot's go-ahead) and release only while it is under 5. Or release only for failures before any network activity (the 400s).

## LOW

### L1. Alert noise from permanent "stuck" rows
- `extraction.ts:71-73` throws on empty text (JS-only pages). `check.ts:114-120` records the error but leaves `status='pending'`. Each such row alerts once at 30 minutes, which is a false alarm for real users. An attacker with rotating IPs can cause up to 96 messages a day (one per run).
- `extraction_error[:120]`, which can carry model or JSON.parse text, goes into the Telegram message. It is plain text but auto-linked.
- Fix: move deterministic failures out of `pending`, or add `AND extraction_error IS NULL` to the newly-stuck query.

### L2. IPv6 keying edge cases (`auth.ts:49-66`), verified locally
- `::ffff:203.0.113.5` is not normalised, so it is a second identity beside `203.0.113.5`.
- `::ffff:cb00:7105`, `::1` and NAT64 forms all collapse to one key, `0:0:0:0::/64`. Cloudflare sends plain IPv4, so this is mostly dev and XFF.
- Zone ids and bracketed forms pass through raw.
- The `X-Forwarded-For` fallback is client-controlled if `CF-Connecting-IP` is ever absent.
- Fix: convert a trailing dotted quad, unmap `::ffff:` to IPv4, return `"unknown"` for unparseable input, and ignore XFF in production behind a dev-only flag.

### L3. Midnight and exception slot handling
- `releaseDailySlot` uses `todayBucket()` at release time. A reservation at 23:59:59 that fails after midnight deletes the wrong day's row. Return the bucket from `tryReserveDailySlot` and pass it in.
- A thrown D1 error after reservation (`check.ts:339-358`) skips release. Use try/finally with a `committed` flag.

### L4. Body cap reads everything first
`check.ts:277` buffers via `request.text()` before the 10,000-char check, which counts UTF-16 units, not bytes. Fix: reject a `Content-Length` over 16 KB and read through a byte-limited stream.

### L5. Text sanitisers miss display-spoofing characters
- `check.ts:24` and `extraction.ts:21` strip only C0 controls and DEL. They keep C1 controls, zero-width characters, bidi overrides and BOM, and `.slice` can split a surrogate pair.
- Sinks checked and safe: Astro `{}` escaping, JSON-LD escaping of `<` and U+2028/2029 (`Layout.astro:23-27`), `safeHttpUrl` for hrefs, and `textContent` in the popup. So this is spoofing, not XSS.
- Fix: one shared strip regex `[\u0000-\u001f\u007f-\u009f​-‏ -‮⁠-⁩﻿]`, and slice by code point.

### L6. Redirect rule details
- `check.ts:84-87`: stripping `www.` on both sides means a submitted `www.acme.com` accepts any final host under `acme.com`. A degenerate `www.com` strips to a bare TLD. It is not practically exploitable, because submit time needs a host under `www.com`. Strip only when 2 or more labels remain, and only widen `www.X` to exactly `X`.
- `crossDomainSources.ts:18-20` with `check.ts:63` allows any `*.stackblitz.com` host. Confirm there is no user-content subdomain, or pin exact hosts.
- An https to http downgrade on the same host is accepted. Consider requiring https.
- `admin.ts:43-48`: `queue_reason` does not know about the redirect. An off-domain row reads "clean extraction, deterministic verdict"; the real reason is only in `extraction_error`. Show `extraction_error` when it starts with `queued_for_review`.

### L7. Cron dispatch and retention wording
- `index.ts:61-68` sends every unrecognised cron string to `checkStuckPending`. A typo in `wrangler.toml` would silently stop the IP purge. Match `"*/15 * * * *"` explicitly and warn on unknown strings. Also fix the `}    if` line join.
- "Nothing older than one UTC day survives" is loose. Rows live up to about 27.5 hours.

### L8. SSRF hardening (no bypass found)
- `ssrf.ts:25,213`: the denylist does not strip a trailing dot. Verified that `localhost.` and `metadata.google.internal.` keep the dot and skip the literal check. They then rely on DoH. `*.localhost` is also unlisted.
- `ssrf.ts:135-137,176`: an IPv6-literal hostname that `expandIpv6` cannot parse skips both DNS and blocking (fail-open). URL canonicalisation currently prevents it. Add an explicit throw.
- Uncovered but unreachable from Workers egress: `::ffff:0:a.b.c.d`, 6to4, Teredo, `64:ff9b:1::/48`, and IPv4 TEST-NET and `192.0.0.0/24`. Add for completeness.

## Checked and found fine
- **Redirects:**
  - Every path into `runExtraction` passes the redirect flag (`check.ts:378`, `cron.ts:125`).
  - The queue branch returns before any tools write.
  - Wayback results always queue.
  - Leave-and-return chains are safe, since only the final body and host count.
  - An open redirect to elsewhere is flagged.
  - Prototype-key lookups in the cross-domain map are impossible (valid domains contain a dot).
- **SSRF address forms:**
  - Decimal, octal, hex and short IPv4, fullwidth dots, uppercase hosts, `[::ffff:127.0.0.1]` and a trailing-dot IPv4 all canonicalise to blocked literals.
  - Zone ids are rejected.
  - Userinfo and backslash tricks parse identically in check and fetch.
  - Credentials and non-80/443 ports are blocked on every hop.
  - DoH fails closed and checks every A and AAAA answer.
- **Rate limiter atomicity:**
  - `INSERT OR IGNORE` on the primary key is atomic, and reserve-then-count stops concurrent overshoot.
  - A global-cap rejection releases only the row this request inserted.
  - 429'd requests never release.
- **Alerting:** the token appears only in the request URL, and neither the URL nor the caught error is logged. SQL is parameterised. Output is capped at one message per run. The 16-minute window catches every row at least once, with about 1 in 15 alerting twice.
- **Purge cron:** it dispatches correctly and does not also run the stuck check.
- **Untrusted text into storage and display:**
  - `sanitizeFacts` nulls non-booleans and caps lengths.
  - All D1 writes are bound.
  - The anonymous `name` is dropped.
  - The `source_url` fragment is stripped and its length capped.
  - The paid key is not in the extension or the frontend.
