import type { Env } from "./index";

export type Tier = "free" | "paid";

// Stub for milestone 3 — always resolves to "free". Milestone 4 replaces the
// body with a real SHA-256 hash-then-lookup against an api_keys table; the
// signature stays the same so callers (lookup.ts) don't need to change.
export async function resolveTier(request: Request, env: Env): Promise<Tier> {
  return "free";
}
