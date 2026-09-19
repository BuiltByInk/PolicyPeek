import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "./index";
import { GLOBAL_DAILY_CHECK_CAP, todayBucket } from "./rateLimit";

// Verifies the boundary called out in the "anonymous /v1/check access +
// server-side daily check cap" commit message: a validation failure (bad
// domain) must NOT consume the caller's one daily free-tier slot, while a
// successfully-queued check must. Updated 2026-09-06 for the atomic
// reserve/release rate-limit model (see DECISIONS_NEEDED.md) -- the pure
// day-bucket helpers are unit-tested in isolation (rateLimit.test.ts); this
// file drives handleCheck end-to-end against a fake D1 that enforces the
// same (client_ip, day_bucket) uniqueness a real PRIMARY KEY would, so the
// reserve-then-release-on-failure wiring is what's actually under test.

vi.mock("./ssrf", () => ({
  SsrfBlockedError: class SsrfBlockedError extends Error {},
  safeFetchText: vi.fn(async () => "<html><body>Some policy text.</body></html>"),
  safeFetchTextWithFinalUrl: vi.fn(async (url: string) => ({
    text: "<html><body>Some policy text.</body></html>",
    finalUrl: url,
  })),
}));

const { handleCheck } = await import("./check");

interface FakeRow {
  [key: string]: unknown;
}

// Minimal fake D1 binding: keyed off substrings of each query this module
// actually issues, backed by plain in-memory arrays. Returns the log arrays
// directly so assertions don't need a real D1 to inspect state.
function makeFakeEnvWithLog() {
  // Keyed by "client_ip|day_bucket" -- mirrors the real (client_ip,
  // day_bucket) PRIMARY KEY's uniqueness, since that's exactly the
  // mechanism under test here (INSERT OR IGNORE either creates a new key or
  // no-ops, never a duplicate).
  const anonymousCheckLog = new Map<string, { client_ip: string; day_bucket: string; checked_at: string }>();
  const pendingChecks: FakeRow[] = [];
  let nextId = 1;

  function prepare(sql: string) {
    let boundArgs: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        boundArgs = args;
        return statement;
      },
      async first<T>() {
        if (sql.includes("FROM api_keys")) return null;
        if (sql.includes("FROM tools")) return null;
        if (sql.includes("COUNT(*) AS n FROM anonymous_check_log")) {
          const day = boundArgs[0];
          return { n: [...anonymousCheckLog.values()].filter((r) => r.day_bucket === day).length } as unknown as T;
        }
        if (sql.includes("INSERT INTO pending_checks")) {
          const row = { id: nextId++, domain: boundArgs[0] };
          pendingChecks.push(row);
          return row as unknown as T;
        }
        return null;
      },
      async all<T>() {
        return { results: [] as T[] };
      },
      async run() {
        if (sql.includes("INSERT OR IGNORE INTO anonymous_check_log")) {
          const [clientIp, dayBucket] = boundArgs as [string, string];
          const key = `${clientIp}|${dayBucket}`;
          if (anonymousCheckLog.has(key)) {
            return { success: true, meta: { changes: 0 } };
          }
          anonymousCheckLog.set(key, { client_ip: clientIp, day_bucket: dayBucket, checked_at: new Date().toISOString() });
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes("DELETE FROM anonymous_check_log")) {
          const [clientIp, dayBucket] = boundArgs as [string, string];
          const key = `${clientIp}|${dayBucket}`;
          const existed = anonymousCheckLog.delete(key);
          return { success: true, meta: { changes: existed ? 1 : 0 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return statement;
  }

  const env = { DB: { prepare } as unknown as Env["DB"], ANTHROPIC_API_KEY: undefined } as Env;
  return { env, anonymousCheckLog, pendingChecks };
}

function makeCtx(): ExecutionContext {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => {
      promises.push(p);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;
}

function makeRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("http://localhost/v1/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify(body),
  });
}

describe("handleCheck daily-cap boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not burn the daily slot on a validation failure (bad domain)", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const res = await handleCheck(makeRequest({ domain: "not a domain!!", source_url: "https://example.com/policy" }), env, makeCtx());

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toMatchObject({ error: "invalid_domain" });
    expect(anonymousCheckLog.size).toBe(0);
  });

  it("does not burn the daily slot when source_url doesn't match the domain", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://evil.com/policy" }),
      env,
      makeCtx()
    );

    expect(res.status).toBe(400);
    expect(anonymousCheckLog.size).toBe(0);
  });

  it("burns the daily slot once a check is successfully queued", async () => {
    const { env, anonymousCheckLog, pendingChecks } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }),
      env,
      makeCtx()
    );

    expect(res.status).toBe(202);
    expect(pendingChecks).toHaveLength(1);
    expect(anonymousCheckLog.size).toBe(1);
    expect([...anonymousCheckLog.values()][0].client_ip).toBe("1.2.3.4");
  });

  it("rejects a second check from the same IP within the window, still without double-burning", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const first = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }),
      env,
      makeCtx()
    );
    expect(first.status).toBe(202);
    expect(anonymousCheckLog.size).toBe(1);

    const second = await handleCheck(
      makeRequest({ domain: "other.com", source_url: "https://other.com/policy" }),
      env,
      makeCtx()
    );
    expect(second.status).toBe(429);
    const json = await second.json();
    expect(json).toMatchObject({ error: "daily_check_limit_reached" });
    expect(anonymousCheckLog.size).toBe(1); // unchanged
  });

  // Regression test for the 2026-09-06 concurrency finding (see
  // DECISIONS_NEEDED.md): the OLD implementation read the count, THEN
  // wrote -- two "concurrent" calls (here: sequential awaits against a
  // shared fake store, which is enough to prove the *logic* is atomic; the
  // real race needed genuine concurrency against real D1, see
  // security/loadtest/) both used to see "0 so far" and both got through.
  // The fix makes the reservation itself the single atomic decision point --
  // this test would have failed under the old isUnderDailyCap/
  // recordAnonymousCheck shape (both calls would have returned 202).
  it("only the first of two same-IP submissions can ever hold the reservation, even racing the exact same day-bucket key", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const [first, second] = await Promise.all([
      handleCheck(makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }, "9.9.9.9"), env, makeCtx()),
      handleCheck(makeRequest({ domain: "other.com", source_url: "https://other.com/policy" }, "9.9.9.9"), env, makeCtx()),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 429]);
    expect(anonymousCheckLog.size).toBe(1);
  });
});

describe("handleCheck global daily ceiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fillToday(anonymousCheckLog: Map<string, { client_ip: string; day_bucket: string; checked_at: string }>, n: number) {
    const day = todayBucket();
    for (let i = 0; i < n; i++) {
      anonymousCheckLog.set(`10.0.${Math.floor(i / 250)}.${i % 250}|${day}`, {
        client_ip: `10.0.${Math.floor(i / 250)}.${i % 250}`,
        day_bucket: day,
        checked_at: new Date().toISOString(),
      });
    }
  }

  it("still accepts the check that lands exactly on the ceiling", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    fillToday(anonymousCheckLog, GLOBAL_DAILY_CHECK_CAP - 1);
    const res = await handleCheck(makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }), env, makeCtx());
    expect(res.status).toBe(202);
    expect(anonymousCheckLog.size).toBe(GLOBAL_DAILY_CHECK_CAP);
  });

  it("refuses with a capacity error once the ceiling is reached, and does not burn the caller's own slot", async () => {
    const { env, anonymousCheckLog, pendingChecks } = makeFakeEnvWithLog();
    fillToday(anonymousCheckLog, GLOBAL_DAILY_CHECK_CAP);
    const res = await handleCheck(makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }, "7.7.7.7"), env, makeCtx());

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "daily_capacity_reached" });
    expect(res.headers.get("Retry-After")).not.toBeNull();
    expect(pendingChecks).toHaveLength(0);
    expect(anonymousCheckLog.has(`7.7.7.7|${todayBucket()}`)).toBe(false);
    expect(anonymousCheckLog.size).toBe(GLOBAL_DAILY_CHECK_CAP); // unchanged
  });
});

describe("handleCheck security edges (2026-09-19 independent review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a public suffix as the domain and does not burn the daily slot", async () => {
    for (const domain of ["github.io", "co.uk", "vercel.app", "pages.dev"]) {
      const { env, anonymousCheckLog } = makeFakeEnvWithLog();
      const res = await handleCheck(makeRequest({ domain, source_url: `https://evil.${domain}/policy` }), env, makeCtx());
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_domain" });
      expect(anonymousCheckLog.size).toBe(0);
    }
  });

  it("still accepts a tenant of a hosting platform as its own domain", async () => {
    const { env } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "someapp.vercel.app", source_url: "https://someapp.vercel.app/privacy" }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(202);
  });

  it("refuses an oversized body with 413 and does not burn the daily slot", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy", name: "x".repeat(40_000) }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(413);
    expect(anonymousCheckLog.size).toBe(0);
  });

  it("gives the slot back if something unexpected throws after it was reserved", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const realPrepare = env.DB.prepare.bind(env.DB);
    (env.DB as unknown as { prepare: (sql: string) => unknown }).prepare = (sql: string) => {
      if (sql.includes("INSERT INTO pending_checks")) throw new Error("D1 exploded");
      return realPrepare(sql);
    };
    await expect(
      handleCheck(makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }), env, makeCtx())
    ).rejects.toThrow("D1 exploded");
    expect(anonymousCheckLog.size).toBe(0);
  });

  it("a caller with a paid key can still set a name; an anonymous caller's name is ignored", async () => {
    // Behaviour is covered by nameForTier's unit tests; this just confirms the
    // request is accepted with a name field present.
    const { env } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy", name: "Acme AI" }),
      env,
      makeCtx()
    );
    expect(res.status).toBe(202);
  });
});
