import type { Env } from "./index";
import { isValidDomain } from "./lookup";
import { safeFetchTextWithFinalUrl, SsrfBlockedError } from "./ssrf";
import { extractFacts, type ExtractedFacts } from "./extraction";
import { getClientIp, resolveTier, type Tier } from "./auth";
import { cleanHtmlToText } from "./htmlClean";
import { tryReserveDailySlot, releaseDailySlot } from "./rateLimit";
import { isKnownSharedDomain } from "./sharedDomains";
import { allowedCrossDomainSource } from "./crossDomainSources";
import { evaluateAutoPublish } from "./autoPublish";
import { tryAutoPublishAtomic } from "./admin";
import { tryWaybackFallback } from "./waybackFallback";

const MAX_BODY_CHARS = 10_000;
const MAX_SOURCE_URL_CHARS = 2_048;
const MAX_NAME_CHARS = 100;

// `name` comes straight from an anonymous caller and, for a brand-new domain
// that auto-publishes, becomes the tool's public display name. Keep it a
// short plain string: no control characters, bounded length, and null (falls
// back to the domain) if nothing usable is left.
export function cleanSubmittedName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_NAME_CHARS);
}

// Only a paid-key caller (in practice: Elliot's batch-submit script) may set
// a tool's display name. The website form and the extension never send one,
// so an anonymous caller supplying a name is someone hitting the API
// directly -- the tool then just shows its domain. (2026-09-19, Elliot's
// ruling: option A on the name question in DECISIONS_NEEDED.md.)
export function nameForTier(tier: Tier, raw: unknown): string | null {
  return tier === "paid" ? cleanSubmittedName(raw) : null;
}

interface CheckBody {
  domain?: string;
  source_url?: string;
  name?: string;
}

// The policy URL has to actually belong to the domain being submitted, not
// an arbitrary attacker-chosen SSRF target. A plain hostname.endsWith(domain)
// would let "evil-acme.com" pass for domain "acme.com" — require an exact
// match or a proper subdomain (dot boundary).
//
// One additional allowed case: a curated, hand-verified cross-domain source
// (crossDomainSources.ts) for products whose genuine policy is published on
// a different domain owned by the same company (e.g. Bolt.new's policy
// lives on stackblitz.com). This is strictly additive to the exact-match/
// subdomain check above, not a loosening of it -- an unrelated domain that
// isn't in that curated map still fails here exactly as before.
export function isSourceHostAllowedForDomain(sourceHost: string, domain: string): boolean {
  const host = sourceHost.toLowerCase();
  const d = domain.toLowerCase();
  if (host === d || host.endsWith(`.${d}`)) return true;

  const crossDomain = allowedCrossDomainSource(d);
  if (crossDomain) {
    const cd = crossDomain.toLowerCase();
    if (host === cd || host.endsWith(`.${cd}`)) return true;
  }

  return false;
}

export interface FetchedPolicy {
  rawHtml: string;
  sourcedFromArchive: boolean;
  archivedUrl: string | null;
  // Set when a redirect carried the fetch to a host that isn't the submitted
  // domain (or its subdomains / curated cross-domain source). The text then
  // isn't proven to be that domain's own policy, so it never auto-publishes.
  redirectedOffDomainTo: string | null;
}

// Decides whether the host a fetch ended up on is still "the same site" as
// the submitted domain. A leading www. on either side is ignored, so
// acme.com <-> www.acme.com never counts as leaving the domain. Otherwise
// this is exactly the submit-time rule (exact, subdomain, or the curated
// cross-domain source), applied to where the redirects landed.
export function isSameSiteAfterRedirect(finalHost: string, domain: string): boolean {
  const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
  return isSourceHostAllowedForDomain(strip(finalHost), strip(domain));
}

// Shared by handleCheck and cron.ts's monthly recheck: try a live fetch
// first, and only fall back to the last Wayback Machine snapshot when the
// live fetch genuinely fails to connect/respond (see waybackFallback.ts).
// A SsrfBlockedError means the URL itself is illegitimate, not merely
// unreachable -- that never falls back, it's a real rejection.
export async function fetchPolicyText(sourceUrl: string, domain: string): Promise<FetchedPolicy> {
  try {
    const { text: rawHtml, finalUrl } = await safeFetchTextWithFinalUrl(sourceUrl);
    const finalHost = new URL(finalUrl).hostname;
    return {
      rawHtml,
      sourcedFromArchive: false,
      archivedUrl: null,
      redirectedOffDomainTo: isSameSiteAfterRedirect(finalHost, domain) ? null : finalHost,
    };
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    const fallback = await tryWaybackFallback(sourceUrl);
    if (!fallback) throw err;
    return { rawHtml: fallback.text, sourcedFromArchive: true, archivedUrl: fallback.archivedUrl, redirectedOffDomainTo: null };
  }
}

export async function runExtraction(
  env: Env,
  pendingId: number,
  domain: string,
  name: string | null,
  sourceUrl: string,
  isRecheck: boolean,
  sharedDomain: boolean,
  sourcedFromArchive: boolean,
  rawText: string,
  redirectedOffDomainTo: string | null = null
): Promise<void> {
  if (!env.ANTHROPIC_API_KEY) {
    await env.DB.prepare(
      "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind("ANTHROPIC_API_KEY not configured", pendingId)
      .run();
    return;
  }

  let facts: ExtractedFacts;
  try {
    facts = await extractFacts(rawText, env.ANTHROPIC_API_KEY);
    await env.DB.prepare(
      "UPDATE pending_checks SET extracted_facts = ?, status = 'extracted', extraction_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind(JSON.stringify(facts), pendingId)
      .run();
  } catch (err) {
    await env.DB.prepare(
      "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind(String(err instanceof Error ? err.message : err), pendingId)
      .run();
    return;
  }

  // A redirect carried the fetch off the submitted domain (2026-09-19,
  // Elliot's ruling: option B in DECISIONS_NEEDED.md). The extracted facts
  // are kept, but this never auto-publishes -- a human sees it first, with
  // the reason in extraction_error (the same channel auto_publish_raced
  // uses to surface a queued row in GET /v1/admin/pending).
  if (redirectedOffDomainTo) {
    await env.DB.prepare(
      "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind(
        `queued_for_review: the policy text came from a different domain after a redirect (${redirectedOffDomainTo}) -- never auto-published`,
        pendingId
      )
      .run();
    return;
  }

  // Tier A of the three-tier publish model (see autoPublish.ts): a clean,
  // unambiguous extraction publishes itself immediately. Anything else
  // (null critical fact, or a recheck whose verdict would flip) stays
  // 'extracted' for the admin queue -- handleListPending explains why.
  //
  // Wrapped in its own try/catch (2026-09-01, Phase 2 finding): this used
  // to be unguarded, so a failure here (e.g. a stale local D1 missing the
  // 'compliant_with_caveats' CHECK constraint value, see DECISIONS_NEEDED.md)
  // was an unhandled ctx.waitUntil rejection -- logged only to the Worker's
  // own console, invisible to the admin queue, with extraction_error left
  // NULL. A row stuck this way was indistinguishable from a normal,
  // correctly-queued tier-B item. Now it's recorded and surfaces in
  // GET /v1/admin/pending like any other flagged row.
  //
  // The `isRecheck` PARAMETER (captured at submission time, in handleCheck,
  // before this potentially-slow extraction even started) is intentionally
  // NOT used for the auto-publish decision below -- only for the
  // pending_checks.is_recheck display value already written at insert time.
  // Using it here was the 2026-09-06 concurrency bug: two concurrent
  // first-time submissions of the same brand-new domain could each capture
  // isRecheck=false, and by the time the slower one reached this point the
  // faster one had already published -- evaluateAutoPublish's verdict-flip
  // guard never even ran for the slower one, since `isRecheck` told it
  // (wrongly, by then) that there was nothing to compare against. Fixed by
  // taking a FRESH read here, immediately before deciding, and using that
  // same snapshot as the compare-and-swap guard on the actual write
  // (tryAutoPublishAtomic) -- see DECISIONS_NEEDED.md and admin.ts's
  // tryAutoPublishAtomic for the full mechanism.
  try {
    const freshExisting = await env.DB.prepare("SELECT id, compliance_status FROM tools WHERE domain = ?")
      .bind(domain)
      .first<{ id: number; compliance_status: string }>();
    const decision = evaluateAutoPublish(facts, {
      sharedDomain,
      isRecheck: freshExisting !== null,
      existingStatus: freshExisting?.compliance_status as Parameters<typeof evaluateAutoPublish>[1]["existingStatus"],
      sourcedFromArchive,
    });

    if (decision.eligible) {
      const result = await tryAutoPublishAtomic(
        env,
        {
          id: pendingId,
          domain,
          name,
          is_recheck: Number(isRecheck),
          status: "extracted",
          source_url: sourceUrl,
          extracted_facts: JSON.stringify(facts),
          shared_domain: Number(sharedDomain),
          sourced_from_archive: Number(sourcedFromArchive),
        },
        freshExisting
      );

      if (!result.published) {
        // Lost the race in the gap between freshExisting and this write --
        // some other concurrent request changed this domain's row first.
        // Don't retry and don't assume success: route to human review the
        // same way a genuine verdict-flip would, rather than risking an
        // unreviewed publish or silently dropping this submission.
        await env.DB.prepare(
          "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
        )
          .bind(
            "auto_publish_raced: another concurrent submission changed this domain's row first; queued for manual review instead of risking an unreviewed verdict",
            pendingId
          )
          .run();
      }
    }
  } catch (err) {
    await env.DB.prepare(
      "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind(`auto_publish_failed: ${String(err instanceof Error ? err.message : err)}`, pendingId)
      .run();
  }
}

export async function handleCheck(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Same "missing/invalid key -> free" degrade resolveTier already applies
  // to GET /v1/lookup, rather than the old hard 401 on any unregistered
  // caller -- the daily cap below is what actually protects the costly
  // path (fetch + LLM extraction) now, not key possession.
  const tier = await resolveTier(request, env);
  const clientIp = getClientIp(request);

  // Reserve BEFORE any costly work, same as before -- but the reservation
  // itself is now the atomic check (see rateLimit.ts). If anything below
  // fails validation or the fetch, the reservation is released so a bad
  // request never burns the caller's one daily slot -- same rule as before,
  // just implemented as reserve-then-release-on-failure instead of
  // check-then-record-on-success, which is what let concurrent requests all
  // pass the old check before any of them recorded (see DECISIONS_NEEDED.md,
  // 2026-09-06).
  let reservedSlot = false;
  if (tier === "free") {
    const reservation = await tryReserveDailySlot(env, clientIp);
    if (!reservation.reserved) {
      const headers = new Headers();
      if (reservation.resetsAt) {
        const retryAfterSeconds = Math.max(0, Math.round((new Date(reservation.resetsAt).getTime() - Date.now()) / 1000));
        headers.set("Retry-After", String(retryAfterSeconds));
      }
      return Response.json(
        {
          error: reservation.reason === "global_cap" ? "daily_capacity_reached" : "daily_check_limit_reached",
          resets_at: reservation.resetsAt,
        },
        { status: 429, headers }
      );
    }
    reservedSlot = true;
  }

  async function failed(response: Response): Promise<Response> {
    if (reservedSlot) await releaseDailySlot(env, clientIp);
    return response;
  }

  // A legitimate submission is three short strings. Read the body as text
  // first so an oversized payload is refused before it's parsed or stored.
  let body: CheckBody;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_CHARS) {
      return failed(Response.json({ error: "payload_too_large" }, { status: 413 }));
    }
    const parsedBody: unknown = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
      return failed(Response.json({ error: "invalid_json" }, { status: 400 }));
    }
    body = parsedBody as CheckBody;
  } catch {
    return failed(Response.json({ error: "invalid_json" }, { status: 400 }));
  }

  // typeof guards: a JSON body can put any type in these fields, and
  // `.trim()` on a number/object would throw an unhandled 500 after the
  // daily slot was already reserved.
  const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : undefined;
  const rawSourceUrl = typeof body.source_url === "string" ? body.source_url.trim() : undefined;
  const name = nameForTier(tier, body.name);

  if (!domain || !isValidDomain(domain)) {
    return failed(Response.json({ error: "invalid_domain" }, { status: 400 }));
  }
  if (!rawSourceUrl) {
    return failed(Response.json({ error: "missing_source_url" }, { status: 400 }));
  }
  if (rawSourceUrl.length > MAX_SOURCE_URL_CHARS) {
    return failed(Response.json({ error: "invalid_source_url" }, { status: 400 }));
  }

  let parsedSource: URL;
  try {
    parsedSource = new URL(rawSourceUrl);
  } catch {
    return failed(Response.json({ error: "invalid_source_url" }, { status: 400 }));
  }
  // A fragment is never sent to the server, so it can't change what gets
  // fetched -- but it would still be stored and later shown as a source link.
  parsedSource.hash = "";
  const sourceUrl = parsedSource.toString();
  // Belt-and-suspenders: see isSourceHostAllowedForDomain's comment.
  if (!isSourceHostAllowedForDomain(parsedSource.hostname, domain)) {
    return failed(Response.json({ error: "source_url_domain_mismatch" }, { status: 400 }));
  }

  let fetched: FetchedPolicy;
  try {
    fetched = await fetchPolicyText(sourceUrl, domain);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return failed(Response.json({ error: "blocked_url", reason: err.message }, { status: 400 }));
    }
    return failed(
      Response.json({ error: "fetch_failed", reason: String(err instanceof Error ? err.message : err) }, { status: 502 })
    );
  }

  // Clean before truncating, not after -- truncating raw HTML first was the
  // bug: <head>/<script>/<style> chrome ate the whole truncation window on
  // JS-rendered sites before any real policy prose was reached.
  const cleanedText = cleanHtmlToText(fetched.rawHtml);

  const isRecheck = await env.DB.prepare("SELECT 1 FROM tools WHERE domain = ?")
    .bind(domain)
    .first();
  const sharedDomain = isKnownSharedDomain(domain);

  const inserted = await env.DB.prepare(
    `INSERT INTO pending_checks (domain, name, is_recheck, source_url, raw_fetch, status, shared_domain, sourced_from_archive, archived_source_url)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?) RETURNING id`
  )
    .bind(
      domain,
      name,
      isRecheck ? 1 : 0,
      sourceUrl,
      cleanedText.slice(0, 20_000),
      Number(sharedDomain),
      Number(fetched.sourcedFromArchive),
      fetched.archivedUrl
    )
    .first<{ id: number }>();

  if (!inserted) {
    return failed(Response.json({ error: "insert_failed" }, { status: 500 }));
  }

  // No separate "record the check" call anymore -- the reservation made at
  // the top of this function already IS the record (see rateLimit.ts).

  ctx.waitUntil(
    runExtraction(
      env,
      inserted.id,
      domain,
      name,
      sourceUrl,
      Boolean(isRecheck),
      sharedDomain,
      fetched.sourcedFromArchive,
      cleanedText,
      fetched.redirectedOffDomainTo
    )
  );

  return Response.json(
    {
      pending_check_id: inserted.id,
      domain,
      status: "pending",
      is_recheck: Boolean(isRecheck),
      sourced_from_archive: fetched.sourcedFromArchive,
    },
    { status: 202 }
  );
}
