import type { Env } from "./index";

// "1 new check per day" per the ICP/monetization decision -- a rolling
// 24h window per client_ip, not a calendar-day reset (avoids timezone
// weirdness around midnight boundaries). Registered API key holders
// (tier === "paid") are exempt entirely -- higher/unlimited cap is the
// existing tiering story, no separate numeric cap invented here.
const FREE_DAILY_CHECK_CAP = 1;
const WINDOW_HOURS = 24;

interface CapCheckResult {
  allowed: boolean;
  resetsAt?: string;
}

// Adds WINDOW_HOURS to an ISO timestamp. Pure so it's unit-testable without
// a D1 mock -- the DB-touching lookup around it isn't (matches the rest of
// this codebase: DB calls in lookup.ts/check.ts aren't unit tested either,
// only their pure helpers are).
export function windowResetAt(firstCheckedAtIso: string): string {
  const resetMs = new Date(firstCheckedAtIso).getTime() + WINDOW_HOURS * 60 * 60 * 1000;
  return new Date(resetMs).toISOString();
}

// Read-only: does NOT record a check. Call before doing any costly work
// (the SSRF-safe fetch + LLM extraction), so an anonymous caller who's
// already at the cap fails fast. Recording happens separately, only once
// the check is actually accepted -- see recordAnonymousCheck.
export async function isUnderDailyCap(env: Env, clientIp: string): Promise<CapCheckResult> {
  const { results } = await env.DB.prepare(
    `SELECT checked_at FROM anonymous_check_log
     WHERE client_ip = ? AND checked_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
     ORDER BY checked_at ASC`
  )
    .bind(clientIp, `-${WINDOW_HOURS} hours`)
    .all<{ checked_at: string }>();

  const count = results?.length ?? 0;
  if (count < FREE_DAILY_CHECK_CAP) {
    return { allowed: true };
  }

  return { allowed: false, resetsAt: windowResetAt(results[0].checked_at) };
}

// Only call after a check has actually been queued (pending_checks insert
// succeeded) -- a request that fails validation (bad domain, blocked URL,
// fetch failure) shouldn't burn the caller's one daily slot.
export async function recordAnonymousCheck(env: Env, clientIp: string): Promise<void> {
  await env.DB.prepare("INSERT INTO anonymous_check_log (client_ip) VALUES (?)").bind(clientIp).run();
}
