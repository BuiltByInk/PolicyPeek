import type { Env } from "./index";
import { expandIpv6 } from "./ssrf";

export type Tier = "free" | "paid";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiKeyRow {
  tier: Tier;
  revoked: number;
}

// A missing or invalid key resolves to "free" rather than an error — /v1/lookup
// is public at the free tier; a key only unlocks the paid-tier response shape.
export async function resolveTier(request: Request, env: Env): Promise<Tier> {
  const key = request.headers.get("X-Api-Key");
  if (!key) return "free";

  const hash = await sha256Hex(key);
  const row = await env.DB.prepare("SELECT tier, revoked FROM api_keys WHERE key_hash = ?")
    .bind(hash)
    .first<ApiKeyRow>();

  if (!row || row.revoked) return "free";
  return row.tier;
}

// POST /v1/check used to reject a missing/invalid key outright instead of
// degrading to free, on the theory that the endpoint costs money to run
// (outbound fetch + LLM call). That's superseded by a real server-side
// daily cap on the free identity instead (see rateLimit.ts) -- /v1/check
// now resolves tier exactly like /v1/lookup via resolveTier() above, so a
// missing/invalid key just means "free, rate-limited" rather than a 401.

// Cloudflare sets CF-Connecting-IP at the edge from the actual TCP
// connection -- it isn't client-suppliable, unlike X-Forwarded-For, so it's
// the one header here actually safe to trust for identity. Falls back to
// X-Forwarded-For's first hop (e.g. local `wrangler dev`, which doesn't
// set CF-Connecting-IP) and then "unknown" so every un-fingerprintable
// request doesn't error, it just shares one rate-limit bucket -- see
// DECISIONS_NEEDED.md for why IP was chosen over a client-supplied token.
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return normalizeIpForRateLimit(cfIp.trim());

  // X-Forwarded-For is client-suppliable, so it's only believed when running
  // locally (wrangler dev), where Cloudflare's own header doesn't exist. In
  // production CF-Connecting-IP is always present; if it ever isn't, everyone
  // shares the "unknown" bucket rather than letting a caller pick their own.
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor && isLocalRequest(request)) return normalizeIpForRateLimit(forwardedFor.split(",")[0].trim());

  return "unknown";
}

function isLocalRequest(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

// One residential or hosting customer typically controls an entire IPv6 /64,
// i.e. billions of distinct addresses. Keying the daily cap on the full
// address would let a single machine mint a fresh "identity" per request and
// bypass it (each one costing a real LLM call). Collapse IPv6 to its /64
// prefix so the cap applies per network, the same way one IPv4 address does.
// IPv4-mapped IPv6 (::ffff:203.0.113.5, ::ffff:cb00:7105) is converted back to
// its IPv4 form so one client can't hold two identities. Anything that isn't a
// parseable IPv4 or IPv6 address (zone ids, brackets, junk) becomes "unknown"
// instead of becoming its own key.
export function normalizeIpForRateLimit(ip: string): string {
  const raw = ip.trim().replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return raw;
  if (!raw.includes(":") || raw.includes("%")) return "unknown";

  // ::ffff:a.b.c.d -> a.b.c.d (dotted-quad tail)
  const dotted = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];

  const groups = expandIpv6(raw);
  if (!groups) return "unknown";

  // ::ffff:hhhh:hhhh (hex tail) -> IPv4
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}::/64`;
}

// Constant-time comparison. Hashing both sides first means the byte-compare
// loop always runs over equal-length digests, so a plain "==" length check
// (or bailing out on the first differing byte) can't leak how much of the
// caller's token was correct via timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < digestA.length; i++) {
    diff |= digestA.charCodeAt(i) ^ digestB.charCodeAt(i);
  }
  return diff === 0;
}

export async function requireAdminToken(request: Request, env: Env): Promise<boolean> {
  const provided = request.headers.get("X-Admin-Token");
  if (!provided || !env.ADMIN_TOKEN) return false;
  return timingSafeEqual(provided, env.ADMIN_TOKEN);
}
