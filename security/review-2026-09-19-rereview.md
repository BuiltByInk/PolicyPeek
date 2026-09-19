# Independent re-review of the 2026-09-19 fixes

Scope: the uncommitted backend/src changes answering `review-2026-09-19-independent.md`, plus decision-log M11. Read-only. Backend tests: 19 files, 152 tests pass. `npm audit --omit=dev`: 0 vulnerabilities. Behaviour was probed with local esbuild-bundled node snippets only (no network, no writes outside the scratchpad).

**Verdict: both original HIGH findings are closed for the cases reviewed. No new HIGH.** One new MEDIUM was introduced by the fix (lookup CPU), and one MEDIUM remains as the residual of H2. Nothing here needs a stop before a deploy decision, but the first MEDIUM is a cheap one-line fix worth making first.

## MEDIUM

### R1. `/v1/lookup` now burns CPU on a long host (new, caused by the fix)
- `lookup.ts:22-40`. `isValidDomain` has no length limit, and `suffixCandidates` now calls tldts once per label, each call scanning a long string.
- Failing input: `GET /v1/lookup?domain=` followed by 8,000 characters of `a.a.a.a...com`. Measured locally: 211 ms at 8 KB, 820 ms at 16 KB (Cloudflare's URL cap), against a few ms before. It is unauthenticated, and each request repeats the cost.
- Related, believed pre-existing: over 100 candidates likely trips D1's bound-parameter limit and returns a 500 (not verified against D1).
- Fix: in `isValidDomain`, add `host.length <= 253` and reject any label over 63 characters. In `suffixCandidates`, stop after 10 labels.

### R2. H2 residual: a brand-new apex can be claimed through a tenant subdomain (open)
- `check.ts:247-260`. `sourceHostChanged` only runs when a row already exists.
- Failing input: domain `substack.com`, source `https://attacker.substack.com/privacy` saying "we never train on your data". tldts confirms `substack.com`, `medium.com`, `wordpress.com`, `tumblr.com` and `github.dev` are ordinary registrable domains, so `isPublicSuffix` lets them through. No row exists, so the same-verdict guard never fires, and it auto-publishes. Every `*.substack.com` site then inherits it via the lookup parent walk.
- Path-based tenants (`medium.com/@x`, `notion.so/page`) cannot be detected by any host rule.
- This is the escalated "should brand-new domains auto-publish a favourable badge" question in `meeting_2026-09-19.md`. Until Elliot rules, a cheap partial mitigation exists.
- Fix: in `runExtraction`, when `freshExisting` is null and the source host is neither `domain`, `www.`+`domain` nor the curated cross-domain host, write the same `queued_for_review` note and return. Cost: catalog-style sources such as `privacy.claude.com` and `docs.granola.ai` would queue for review.

## LOW

### R3. `sourceHostChanged` treats `www.X` and `X` as different hosts
- `check.ts:156-166`. It is a safe-direction false positive, not a bypass. 9 of the 33 catalog rows store a `www.` source, so an apex resubmission of an existing tool queues instead of re-confirming.
- The monthly recheck is unaffected (it passes the stored URL, so the hosts are identical).
- Fix: `const norm = (h) => h.replace(/^www\./, "")` on both hosts before comparing.
- Fail-open case: a stored value of `[]` or unparseable JSON returns null (no protection). No seeded row is empty; worth confirming in D1.

### R4. Reservation can leak if the count query throws
- `check.ts:318` sits outside the new try/catch. If `tryReserveDailySlot`'s `INSERT` succeeds and the following `SELECT COUNT` throws, the slot stays reserved and the caller loses their day to our fault.
- Fix: wrap the call, and on a throw run `await releaseDailySlot(env, clientIp).catch(() => {})` before rethrowing. The restructure itself has no double-release: `failed()` runs twice only if the first release throws, and the DELETE is idempotent.

### R5. `cleanText` still passes several invisible characters
- `textUtil.ts:8`. Verified survivors: Unicode tag characters U+E0000-E007F (invisible "ASCII smuggling" text), soft hyphen U+00AD, U+061C, U+180E, variation selectors U+FE00-FE0F, U+FFF9-FFFC.
- Fix: switch the regex to the `u` flag and add `­͏؜᠎︀-️￹-￼\u{E0000}-\u{E007F}`.
- Optional: `value.slice(0, max * 8)` before the regex bounds work on huge input. A 5 MB string took 34 ms, so this is not urgent.

### R6. Alert blind spot for systemic empty-text failures
- `cron.ts:66`. `empty_extracted_text` rows never alert. If a `cleanHtmlToText` or fetch regression made every page empty, nobody is told.
- Fix: add a count query and send one alert when five or more such rows appear in an hour.
- `cronDispatch.test.ts` hardcodes the three cron strings and does not read `wrangler.toml`, so drift would go unnoticed. Make the test parse the `crons` line and assert each entry maps to a job.

### R7. Public-suffix false positives and IP edge forms
- Brand apexes that sit on the PSL private list are now rejected at submit and skipped at lookup: `supabase.co`, `hf.space`, `netlify.app`, `streamlit.app`, `lovable.app`, `replit.app`, `bolt.host`, `webflow.io`, `framer.website`, `fly.dev`, `onrender.com`. Subdomains still work as their own rows. No current catalog row is affected (checked all 33). Accept; tldts must be bumped periodically for new PSL entries.
- `normalizeIpForRateLimit` returns `"unknown"` for `0:0:0:0:0:ffff:203.0.113.5` and `::ffff:0:a.b.c.d`, and `::1` or NAT64 still collapse to one /64 key. Only reachable when `CF-Connecting-IP` is absent or malformed. Reuse `convertTrailingIpv4` from `ssrf.ts` if wanted.
- SSRF gaps that remain (hardening only, unreachable from Workers egress): IPv6 multicast `ff00::/8`, `100::/64`, `2001:db8::/32`, `fec0::/10`.

## Checked and found fine

- **H1, `sharedDomains.ts:30-36`:**
  - True for `www.adobe.com`, `WWW.ADOBE.COM.`, `gemini.google.com`, `a.b.c.d.google.com`, `aws.amazon.com`, `x.vercel.com`.
  - False for `notgoogle.com`, `evilgoogle.com`, `google.com.evil.com`, `xn--google.com`, `vercel.app`.
  - Applied on both paths (`check.ts:432`, `cron.ts:106`); no other computation of the flag exists. Lookup needs no change: `gemini.google.com` walks to the shared `google.com` row.
  - A double trailing dot (`google.com..`) is false but unreachable, because `isValidDomain` rejects trailing dots. Use `/\.+$/` anyway.
  - The curated list itself omits youtube.com, gmail.com, azure.com and office.com. That is list coverage, not a regression.
  - Any row already published under a shared subdomain before this fix stays live until the recheck flip is approved. Run a read-only D1 query: `SELECT domain, compliance_status FROM tools WHERE shared_domain = 0`, then compare against the list.
- **H2, `domainUtil.ts`:**
  - Case, trailing dot, punycode, unicode IDN, single labels and IP literals are all handled, and everything odd fails closed (null, so treated as a suffix and rejected): `co.uk`, `CO.UK.`, `github.io`, `vercel.app`, `pages.dev`, `notion.site`, `com`, `::1`, `1.2.3.4`, `acme..com`, and 300-character hosts.
  - Real tenant hosts pass: `a.github.io`, `x.blogspot.com`.
  - A 16 KB submitted domain costs 0.1 ms. `suffixCandidates` keeps every non-suffix candidate, so `foo.co.uk` and multi-label tools resolve.
- **Redirect rule:** `www.X` and `X` are equal only as an exact pair. `evil.acme.com` against `www.acme.com` is false, and `www.com` is not collapsed. An https to http downgrade is treated as leaving the site.
- **`readBodyLimited`:**
  - Missing `Content-Length` counts as 0 and the stream is counted. A declared length over the cap is refused unread, and a non-numeric value is ignored.
  - Exactly 16,384 bytes is accepted; 16,385 is refused. Chunked bodies are counted, multibyte characters are decoded after concatenation, and the stream is cancelled on overflow.
  - An empty body still gives 400 `invalid_json`. Bodies of 10,001-16,384 bytes now pass where they were 413 before; intended.
- **`auth.ts`:**
  - `X-Forwarded-For` is honoured only when the request URL host is localhost, 127.0.0.1 or `[::1]`. In production `CF-Connecting-IP` always wins and is edge-set, so a caller cannot choose their key.
  - Mapped forms (`::ffff:203.0.113.5`, `::FFFF:cb00:7105`, full hex form) all give `203.0.113.5`.
  - Zone ids, ports, brackets and junk give `"unknown"`. 100 KB inputs, a colon flood and dotted floods do not throw or hang.
- **`ssrf.ts`:**
  - Trailing dots are stripped before the checks. The DoH lookup uses the stripped name and fetch keeps the dot, so both mean the same host.
  - `*.localhost` is blocked. An unparseable IPv6 literal now throws. The port allowlist is 80 and 443, and credentials are refused on every hop.
  - Verified blocked: 192.0.2.x, 198.51.100.x, 203.0.113.x, 192.0.0.x, 2002::, 2001:0:, `::ffff:0:127.0.0.1`, `64:ff9b:1::`.
  - Verified allowed: 1.1.1.1, 8.8.8.8, 2606:4700::1111, 2001:4860:4860::8888, 192.0.1.1, 198.51.101.1, 203.0.114.1.
  - No regression found for public policy pages.
- **Cron and alerts:** `*/15 * * * *`, `0 3 1 * *` and `30 3 * * *` match `wrangler.toml`, and an unknown string only warns. The `NOT LIKE` prefix matches the exact text at `extraction.ts:71`, and `_` as a wildcard is harmless. `cleanText(null, 120)` returns null. Real outages such as a missing API key still alert.
- **`cleanText`:** no input throws (lone surrogates pass through, objects and null give null), and truncation is by code point.
- **Dependency and bundle:**
  - tldts 7.4.13 and tldts-core are MIT. There are no install or postinstall scripts (only build, prepack and test). The lockfile has integrity hashes, and tldts-core has no dependencies.
  - The built code contains no `eval`, `new Function`, fetch or environment access. The PSL is embedded as data, with no runtime download.
  - My minified esbuild bundle was 157 KB (56 KB gzip), and module evaluation took about 10 ms. Both are far inside the Worker limits, including the 1 s startup limit. The M11 figure of 214 KiB is plausible with wrangler's own bundling.

## First-review items still open

- **H1:** closed.
- **H2:** closed for public suffixes and existing rows; open for new non-PSL tenant apexes (R2).
- **M1, M2:** open by decision (escalated to Elliot, not changed).
- **L1:** closed with the R6 caveat.
- **L2 through L8:** closed, apart from the leftovers in R4 and R7.
