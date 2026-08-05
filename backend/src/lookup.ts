import type { Env } from "./index";
import type { Tier } from "./auth";

interface ToolRow {
  id: number;
  name: string;
  domain: string;
  compliance_status: string;
  data_retention: string | null;
  trains_on_user_data: number | null;
  gdpr_mentioned: number | null;
  source_urls: string;
  verified: number;
  summary: string | null;
}

// Most-specific to least-specific, e.g. "checkout.shop.example.com" ->
// ["checkout.shop.example.com", "shop.example.com", "example.com"].
// Drops the bare TLD (a single label has nothing to match against).
export function isValidDomain(host: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host.toLowerCase());
}

export function suffixCandidates(host: string): string[] {
  const labels = host
    .toLowerCase()
    .split(".")
    .filter((l) => l.length > 0);
  const candidates: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join("."));
  }
  return candidates;
}

async function findByCandidates(env: Env, candidates: string[]): Promise<ToolRow | null> {
  if (candidates.length === 0) return null;
  const placeholders = candidates.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM tools WHERE domain IN (${placeholders})`
  )
    .bind(...candidates)
    .all<ToolRow>();

  if (!results || results.length === 0) return null;

  // Most specific candidate that has a match wins.
  let best: ToolRow | null = null;
  let bestIndex = Infinity;
  for (const row of results) {
    const idx = candidates.indexOf(row.domain);
    if (idx !== -1 && idx < bestIndex) {
      bestIndex = idx;
      best = row;
    }
  }
  return best;
}

export async function handleLookup(request: Request, env: Env, tier: Tier): Promise<Response> {
  const url = new URL(request.url);
  const rawDomain = url.searchParams.get("domain");

  if (!rawDomain) {
    return Response.json({ error: "missing_domain" }, { status: 400 });
  }

  let host: string;
  try {
    host = rawDomain.includes("://") ? new URL(rawDomain).hostname : rawDomain;
  } catch {
    return Response.json({ error: "invalid_domain" }, { status: 400 });
  }
  host = host.trim().toLowerCase();
  if (!isValidDomain(host)) {
    return Response.json({ error: "invalid_domain" }, { status: 400 });
  }

  const candidates = suffixCandidates(host);
  const match = await findByCandidates(env, candidates);

  if (!match) {
    return Response.json({ error: "not_found", domain: host }, { status: 404 });
  }

  const base = {
    domain: host,
    matched_domain: match.domain,
    name: match.name,
    compliance_status: match.compliance_status,
    summary: match.summary,
  };

  if (tier === "free") {
    return Response.json(base);
  }

  return Response.json({
    ...base,
    data_retention: match.data_retention,
    trains_on_user_data: match.trains_on_user_data === null ? null : Boolean(match.trains_on_user_data),
    gdpr_mentioned: match.gdpr_mentioned === null ? null : Boolean(match.gdpr_mentioned),
    source_urls: JSON.parse(match.source_urls || "[]"),
    verified: Boolean(match.verified),
  });
}
