import type { Env } from "./index";

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

// Stricter than resolveTier: for endpoints that cost money to run
// (POST /v1/check triggers an outbound fetch + LLM call), a missing or
// invalid key is rejected outright rather than silently downgraded to free.
export async function requireApiKey(request: Request, env: Env): Promise<Tier | null> {
  const key = request.headers.get("X-Api-Key");
  if (!key) return null;

  const hash = await sha256Hex(key);
  const row = await env.DB.prepare("SELECT tier, revoked FROM api_keys WHERE key_hash = ?")
    .bind(hash)
    .first<ApiKeyRow>();

  if (!row || row.revoked) return null;
  return row.tier;
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
