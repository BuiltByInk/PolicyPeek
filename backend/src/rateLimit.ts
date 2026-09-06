import type { Env } from "./index";

// "1 new check per day" per the ICP/monetization decision -- per UTC
// calendar day now, not a rolling 24h window (see schema.sql's
// anonymous_check_log comment for why that changed). Registered API key
// holders (tier === "paid") are exempt entirely -- higher/unlimited cap is
// the existing tiering story, no separate numeric cap invented here. The
// cap of exactly 1 is structural here (one row per (ip, day) is physically
// all the PRIMARY KEY allows), not a count compared against a configurable
// number -- there's no constant to name.

interface ReserveResult {
  reserved: boolean;
  resetsAt?: string;
}

// Pure so it's unit-testable without a D1 mock -- matches the rest of this
// codebase's pattern (DB calls in lookup.ts/check.ts aren't unit tested
// either, only their pure helpers are).
export function todayBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10); // 'YYYY-MM-DD', UTC
}

export function nextDayResetAt(now: Date = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  ).toISOString();
}

// Atomically attempts to reserve today's single free-tier check slot for
// this IP -- this call IS the rate limit, there's no separate "is it under
// the cap" read before it. A prior version read a count first and recorded
// separately; concurrent requests could all read "under the cap" before any
// of them had recorded one, bypassing it entirely (confirmed 2/2, 5/5,
// 10/10 concurrent requests all getting through in testing -- see
// DECISIONS_NEEDED.md, 2026-09-06). The (client_ip, day_bucket) PRIMARY KEY
// makes the INSERT itself the atomic decision: D1/SQLite serializes writes
// to one database internally, so of any number of concurrent INSERTs for
// the same (ip, day), exactly one can succeed.
//
// Call this BEFORE doing any costly work (the SSRF-safe fetch + LLM
// extraction), so an anonymous caller who's already at the cap fails fast.
// If the request goes on to fail validation for an unrelated reason (bad
// domain, blocked URL, fetch failure), call releaseDailySlot to give the
// slot back -- see check.ts's handleCheck for the full reserve/release flow.
export async function tryReserveDailySlot(env: Env, clientIp: string): Promise<ReserveResult> {
  const bucket = todayBucket();
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO anonymous_check_log (client_ip, day_bucket) VALUES (?, ?)"
  )
    .bind(clientIp, bucket)
    .run();

  if (result.meta.changes > 0) {
    return { reserved: true };
  }
  return { reserved: false, resetsAt: nextDayResetAt() };
}

// Compensating action for a reservation that turned out not to correspond
// to a genuinely-queued check (the request failed validation or the fetch
// afterward) -- preserves the original "a validation failure shouldn't burn
// the caller's one daily slot" rule from before this was made atomic.
export async function releaseDailySlot(env: Env, clientIp: string): Promise<void> {
  await env.DB.prepare("DELETE FROM anonymous_check_log WHERE client_ip = ? AND day_bucket = ?")
    .bind(clientIp, todayBucket())
    .run();
}
