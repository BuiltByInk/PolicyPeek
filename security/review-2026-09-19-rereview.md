# Security re-review of the 2026-09-19 fixes

Scope: the backend/src changes described in decision log M11, read-only. Backend tests: 19 files, 158 tests pass (the log says 152). `tsc` is clean and `npm audit --omit=dev` finds nothing. I probed behaviour with local node snippets against copies of the source in the scratchpad. Nothing was fetched and nothing ran against production.

No HIGH findings. The two original HIGHs (H1 shared-domain subdomains, H2 public suffixes) are closed for the cases that were reported. H2 still has a residual gap (M-A below).

## MEDIUM

### M-A. Multi-tenant apexes that are not on the Public Suffix List can still be registered (residual H2)
- Where: `domainUtil.ts:12`, `check.ts:387`, `check.ts:87`.
- `isPublicSuffix` is false for substack.com, wordpress.com, medium.com, github.com, notion.so and huggingface.co. I ran it.
- Failing input: domain `substack.com`, source `https://attacker.substack.com/privacy`, on a brand-new domain. The source host is "under the domain", so it passes. The row auto-publishes, and every `*.substack.com` lookup inherits it.
- The attacker can publish a false "compliant" badge or a smear such as "not_compliant". `sourceHostChanged` only protects rows that already exist.
- Fix (either or both):
  - Queue a first publish whenever the source host is not exactly the domain or `www.` plus the domain, or the curated cross-domain host.
  - Add these platforms to `KNOWN_SHARED_DOMAINS`.
- Related: `github.com/<user>/...` and `medium.com/@user` are path-based, so no host rule can catch them. Only the queue rule or the shared list helps.

## LOW

### L-A. `sourceHostChanged` fails open (`check.ts:156-166`)
- Failing input: an existing row whose `source_urls` is NULL, `[]`, malformed JSON, or holds a non-string first element. The function returns null and the overwrite proceeds.
- Fix: when a row exists and has no usable stored source, queue. The monthly recheck skips such rows anyway (`cron.ts:101`), so it is unaffected.

### L-B. `sourceHostChanged` false queues
- `acme.com/privacy` stored and `www.acme.com/privacy` resubmitted queues. So does a redirect landing on `acme.com.` (trailing dot). Both fail safe but add work for Elliot.
- Fix: compare hostnames after the same `www.`-strip and trailing-dot strip that `isSameSiteAfterRedirect` uses. Keep every other subdomain strict.
- Monthly recheck: I checked that `cron.ts:100,128` passes the stored URL, so old and new hosts are identical and it never self-queues.

### L-C. Lookup cost and parameter limit (`lookup.ts:27-40`, `isValidDomain`)
- `isValidDomain` has no length cap. An unauthenticated `/v1/lookup` with an 8 KB dotted host took about 208 ms of CPU locally. About 160 ms of that is the old join cost, and tldts adds roughly 30%.
- Hosts of 100 labels or more produce more than 100 candidates. I believe that exceeds D1's bound-parameter limit and would 500, but I did not test against D1.
- Fix: cap at 253 characters and about 10 labels in `isValidDomain` or `suffixCandidates`.

### L-D. `cleanText` misses some invisible characters (`textUtil.ts:8`)
- Survivors: U+00AD soft hyphen, U+061C, U+180E, U+034F, U+206A-206F, variation selectors FE00-FE0F, Hangul fillers (U+115F, U+1160, U+3164, U+FFA0), and tag characters U+E0000-E007F. A lone surrogate also survives.
- Impact: display spoofing only. All sinks were found safe in the first review.
- Fix: use a `u`-flag class of `\p{Cc}\p{Cf}\p{Zl}\p{Zp}` plus the fillers and variation selectors, then call `.toWellFormed()`.

### L-E. Rejected public-suffix domains give a generic error
- Real products on private-suffix apexes now get `invalid_domain`: framer.ai, ngrok.io, ngrok.app, replit.dev, deno.dev, supabase.co, fly.dev, vercel.app, lovable.app, bolt.host, hf.space, workers.dev, pages.dev, web.app. Tenant hosts such as `foo.vercel.app` still work.
- Fix: return a distinct code such as `public_suffix` with a plain message on the site and in the extension.
- Elliot should still run the read-only D1 query for existing rows whose domain is a public suffix. The fix stops new ones but does not remove old ones. (Open from the first review.)

### L-F. Smaller items
- Alerts: `empty_extracted_text` is now excluded. Other permanent failures (`no_json_object_in_response`, `anthropic_api_4xx`) still alert once per row. Text is cleaned, capped at 120 characters and sent without parse_mode, but it can still auto-link. The cap is one message per run.
- `normalizeIpForRateLimit` does not range-check octets, so `999.1.1.1` and `::ffff:256.1.1.1` pass through as keys. `::1`, `::` and `::a.b.c.d` share one bucket. Only the CF header and the localhost XFF feed it, so this is not exploitable.
- `cronDispatch.test.ts` does not read `wrangler.toml`. A test that every configured cron maps to a job would catch drift.
- `cron.ts:100`: `JSON.parse` sits outside the try block. One row with malformed `source_urls` aborts the whole monthly recheck. This is old behaviour.
- `KNOWN_SHARED_DOMAINS` coverage: `google.co.uk`, `amazon.de`, `youtube.com`, `facebook.com`, `github.com`, `linkedin.com` and `live.com` are not listed. The matching is right; the list is a curation gap.

## Checked and found fine
1. **Shared-domain matching (`sharedDomains.ts:31-35`):**
   - True for `www.adobe.com`, `WWW.ADOBE.COM`, `gemini.google.com`, `adobe.com.`.
   - False for `notgoogle.com`, `google.com.evil.com`, `evil-google.com`, `adobe.com..`.
   - Both `check.ts:432` and `cron.ts:106` use it. A published subdomain row would flip on recheck and queue, which is correct.
2. **tldts handling:**
   - Uppercase and punycode (`xn--55qx5d.cn`) are handled.
   - IPs, bare TLDs, `a..b.com` and wildcard and exception rules fail closed. A null result counts as a suffix.
   - `co.uk`, `github.io`, `vercel.app`, `pages.dev` and `notion.site` are rejected, and their candidates are dropped from the lookup walk.
   - The public-suffix check runs after `isValidDomain`, and none of it throws.
   - The 33 rows in `frontend/data/tools.json` include no suffixes.
3. **`readBodyLimited`:**
   - Exactly 16,384 bytes passes and 16,385 is refused.
   - A chunked body with no Content-Length is refused mid-stream. A lying small Content-Length is refused by counting.
   - A multibyte body is counted in bytes. Invalid UTF-8 decodes without throwing.
4. **Slot release:**
   - It uses the reserved bucket and runs on exceptions.
   - A double release is an idempotent DELETE.
   - A throw before the pending row is inserted releases correctly.
5. **Client IP:**
   - Production callers cannot choose their key. `CF-Connecting-IP` wins. XFF is honoured only when the request URL host is localhost, `[::1]` or `127.0.0.1`, and the Worker is only routed at `api.getpolicypeek.com`.
   - Garbage, zone ids, brackets and the empty string give `unknown` without throwing. IPv4-mapped forms map to IPv4.
6. **SSRF additions:**
   - The trailing dot, `*.localhost`, TEST-NET, 6to4, Teredo, SIIT and NAT64 /48 checks all work.
   - An unparseable IPv6 literal now throws (fail-closed).
   - I found no regression. The IPv4 `c` argument is passed on all three call paths.
7. **Cron:** `cronJobFor` matches `wrangler.toml` exactly, and an unknown string only warns. The alert query is parameterised.
8. **tldts 7.4.13:**
   - Licence is MIT, and so is tldts-core. The lockfile is pinned with integrity hashes.
   - It has no install scripts and no network or eval use.
   - My local esbuild bundle is 154 KB minified and 56 KB gzipped, so the Worker size is fine. Module load took 10 ms.
   - `package.json` uses a caret range, so deploys must use `npm ci`.

## First-review items still open
- M1 (one actor exhausting the global ceiling) and M2 (release-on-failure gives free outbound fetches). Both were escalated deliberately and are unchanged.
- The D1 query for suffix-domain rows.
- The `*.stackblitz.com` cross-domain allowance is still wide. It is now mitigated for the existing bolt.new row by `sourceHostChanged`.
- I did not re-verify the retention wording in the privacy text. The `rateLimit.ts:107` comment is unchanged.
