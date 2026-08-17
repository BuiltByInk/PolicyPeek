import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Env } from "./index";

// Verifies the boundary called out in the "anonymous /v1/check access +
// server-side daily check cap" commit message: a validation failure (bad
// domain) must NOT consume the caller's one daily free-tier slot, while a
// successfully-queued check must. isUnderDailyCap/recordAnonymousCheck are
// unit-tested in isolation (rateLimit.test.ts) but nothing previously drove
// handleCheck end-to-end to confirm they're wired together correctly.

vi.mock("./ssrf", () => ({
  SsrfBlockedError: class SsrfBlockedError extends Error {},
  safeFetchText: vi.fn(async () => "<html><body>Some policy text.</body></html>"),
}));

const { handleCheck } = await import("./check");

interface FakeRow {
  [key: string]: unknown;
}

// Minimal fake D1 binding: keyed off substrings of each query this module
// actually issues, backed by plain in-memory arrays. Returns the log arrays
// directly so assertions don't need a real D1 to inspect state.
function makeFakeEnvWithLog() {
  const anonymousCheckLog: { client_ip: string; checked_at: string }[] = [];
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
        if (sql.includes("INSERT INTO pending_checks")) {
          const row = { id: nextId++, domain: boundArgs[0] };
          pendingChecks.push(row);
          return row as unknown as T;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes("FROM anonymous_check_log")) {
          const clientIp = boundArgs[0] as string;
          const matches = anonymousCheckLog.filter((r) => r.client_ip === clientIp);
          return { results: matches as unknown as T[] };
        }
        return { results: [] as T[] };
      },
      async run() {
        if (sql.includes("INSERT INTO anonymous_check_log")) {
          anonymousCheckLog.push({
            client_ip: boundArgs[0] as string,
            checked_at: new Date().toISOString(),
          });
        }
        return { success: true };
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
    expect(anonymousCheckLog).toHaveLength(0);
  });

  it("does not burn the daily slot when source_url doesn't match the domain", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const res = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://evil.com/policy" }),
      env,
      makeCtx()
    );

    expect(res.status).toBe(400);
    expect(anonymousCheckLog).toHaveLength(0);
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
    expect(anonymousCheckLog).toHaveLength(1);
    expect(anonymousCheckLog[0].client_ip).toBe("1.2.3.4");
  });

  it("rejects a second check from the same IP within the window, still without double-burning", async () => {
    const { env, anonymousCheckLog } = makeFakeEnvWithLog();
    const first = await handleCheck(
      makeRequest({ domain: "acme.com", source_url: "https://acme.com/policy" }),
      env,
      makeCtx()
    );
    expect(first.status).toBe(202);
    expect(anonymousCheckLog).toHaveLength(1);

    const second = await handleCheck(
      makeRequest({ domain: "other.com", source_url: "https://other.com/policy" }),
      env,
      makeCtx()
    );
    expect(second.status).toBe(429);
    const json = await second.json();
    expect(json).toMatchObject({ error: "daily_check_limit_reached" });
    expect(anonymousCheckLog).toHaveLength(1); // unchanged
  });
});
