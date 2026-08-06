import type { Env } from "./index";
import { isValidDomain } from "./lookup";
import { safeFetchText, SsrfBlockedError } from "./ssrf";
import { extractFacts } from "./extraction";
import { requireApiKey } from "./auth";

interface CheckBody {
  domain?: string;
  source_url?: string;
}

// The policy URL has to actually belong to the domain being submitted, not
// an arbitrary attacker-chosen SSRF target. A plain hostname.endsWith(domain)
// would let "evil-acme.com" pass for domain "acme.com" — require an exact
// match or a proper subdomain (dot boundary).
export function isSourceHostAllowedForDomain(sourceHost: string, domain: string): boolean {
  const host = sourceHost.toLowerCase();
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

async function runExtraction(env: Env, pendingId: number, rawText: string): Promise<void> {
  if (!env.ANTHROPIC_API_KEY) {
    await env.DB.prepare(
      "UPDATE pending_checks SET extraction_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    )
      .bind("ANTHROPIC_API_KEY not configured", pendingId)
      .run();
    return;
  }

  try {
    const facts = await extractFacts(rawText, env.ANTHROPIC_API_KEY);
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
  }
}

export async function handleCheck(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const tier = await requireApiKey(request, env);
  if (!tier) {
    return Response.json({ error: "invalid_or_missing_api_key" }, { status: 401 });
  }

  let body: CheckBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  const sourceUrl = body.source_url?.trim();

  if (!domain || !isValidDomain(domain)) {
    return Response.json({ error: "invalid_domain" }, { status: 400 });
  }
  if (!sourceUrl) {
    return Response.json({ error: "missing_source_url" }, { status: 400 });
  }

  let parsedSource: URL;
  try {
    parsedSource = new URL(sourceUrl);
  } catch {
    return Response.json({ error: "invalid_source_url" }, { status: 400 });
  }
  // Belt-and-suspenders: see isSourceHostAllowedForDomain's comment.
  if (!isSourceHostAllowedForDomain(parsedSource.hostname, domain)) {
    return Response.json({ error: "source_url_domain_mismatch" }, { status: 400 });
  }

  let rawText: string;
  try {
    rawText = await safeFetchText(sourceUrl);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      return Response.json({ error: "blocked_url", reason: err.message }, { status: 400 });
    }
    return Response.json({ error: "fetch_failed", reason: String(err instanceof Error ? err.message : err) }, { status: 502 });
  }

  const isRecheck = await env.DB.prepare("SELECT 1 FROM tools WHERE domain = ?")
    .bind(domain)
    .first();

  const inserted = await env.DB.prepare(
    "INSERT INTO pending_checks (domain, is_recheck, source_url, raw_fetch, status) VALUES (?, ?, ?, ?, 'pending') RETURNING id"
  )
    .bind(domain, isRecheck ? 1 : 0, sourceUrl, rawText.slice(0, 20_000))
    .first<{ id: number }>();

  if (!inserted) {
    return Response.json({ error: "insert_failed" }, { status: 500 });
  }

  ctx.waitUntil(runExtraction(env, inserted.id, rawText));

  return Response.json(
    {
      pending_check_id: inserted.id,
      domain,
      status: "pending",
      is_recheck: Boolean(isRecheck),
    },
    { status: 202 }
  );
}
