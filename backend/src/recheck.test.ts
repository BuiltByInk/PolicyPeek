import { describe, it, expect, vi } from "vitest";
import type { Env } from "./index";
import { runDueRechecks, isOverdueAlertDay, formatOverdueAlert, alertOverdueTools, RECHECK_AFTER_DAYS, RETRY_AFTER_DAYS, MAX_RECHECKS_PER_RUN } from "./cron";
import { markToolAttempt } from "./toolCheckState";

function makeEnv(dueTools: unknown[] = [], overdue: unknown[] = []) {
  const log: { sql: string; args: unknown[] }[] = [];
  const env = {
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) {
            args = a;
            return st;
          },
          async all() {
            log.push({ sql, args });
            return { results: sql.includes("ORDER BY COALESCE(last_checked_at, '') ASC\n     LIMIT ?") ? dueTools : overdue };
          },
          async first() {
            log.push({ sql, args });
            return null;
          },
          async run() {
            log.push({ sql, args });
            return { success: true, meta: { changes: 1 } };
          },
        };
        return st;
      },
    },
  } as unknown as Env;
  return { env, log };
}

describe("runDueRechecks selection", () => {
  it("asks for the most overdue tools first, only ones not attempted recently, capped per run", async () => {
    const { env, log } = makeEnv([]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await runDueRechecks(env);
    const q = log.find((l) => l.sql.includes("FROM tools"))!;
    expect(q.sql).toContain("last_checked_at IS NULL OR last_checked_at <");
    expect(q.sql).toContain("last_attempt_at IS NULL OR last_attempt_at <");
    expect(q.sql).toContain("source_urls IS NOT NULL AND source_urls != '[]'"); // tools with no source page never take a slot
    expect(q.sql).toContain("ORDER BY COALESCE(last_checked_at, '') ASC");
    expect(q.args).toEqual([`-${RECHECK_AFTER_DAYS} days`, `-${RETRY_AFTER_DAYS} days`, MAX_RECHECKS_PER_RUN]);
    expect(MAX_RECHECKS_PER_RUN).toBeLessThanOrEqual(10); // stays within a Worker's subrequest budget
  });

  it("marks the attempt before doing the slow work, and records a failure reason", async () => {
    const tool = { id: 1, domain: "acme.com", source_urls: JSON.stringify(["https://acme.com/privacy"]), last_checked_at: null, last_check_note: null };
    const { env, log } = makeEnv([tool]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // no fetch stub: the SSRF-safe fetch fails in this environment, which is the failure path we want
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await runDueRechecks(env);
    vi.unstubAllGlobals();

    const attempts = log.filter((l) => l.sql.startsWith("UPDATE tools SET last_attempt_at"));
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts[0].sql).not.toContain("last_check_note"); // first: plain attempt marker
    const failure = attempts.find((a) => a.sql.includes("last_check_note = ?"))!;
    expect(String(failure.args[0])).toContain("recheck failed");
    expect(failure.args[1]).toBe("acme.com");
  });
});

describe("overdue alert", () => {
  it("only runs on Mondays (UTC)", () => {
    expect(isOverdueAlertDay(new Date("2026-09-21T04:00:00Z"))).toBe(true); // Monday
    expect(isOverdueAlertDay(new Date("2026-09-22T04:00:00Z"))).toBe(false);
  });

  it("lists domains with their last confirmed date and reason, capped", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ domain: `t${i}.com`, last_checked_at: "2026-06-01T00:00:00Z", last_check_note: i === 0 ? "recheck failed: 403" : null }));
    const text = formatOverdueAlert(rows);
    expect(text).toContain("12 published tool(s)");
    expect(text).toContain("t0.com (last confirmed 2026-06-01) -- recheck failed: 403");
    expect(text).toContain("and 2 more");
    expect(formatOverdueAlert([{ domain: "a.com", last_checked_at: null, last_check_note: null }])).toContain("last confirmed never");
  });

  it("sends nothing when no tool is overdue", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { env } = makeEnv([], []);
    await alertOverdueTools({ ...env, ALERT_BOT_TOKEN: "t", ALERT_CHAT_ID: "1" } as Env);
    vi.unstubAllGlobals();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("markToolAttempt", () => {
  it("cleans the note and only touches a published domain's row", async () => {
    const { env, log } = makeEnv();
    await markToolAttempt(env, "acme.com", "bad\u0007 note " + "x".repeat(500));
    const u = log[0];
    expect(u.sql).toContain("WHERE domain = ?");
    expect(String(u.args[0]).length).toBeLessThanOrEqual(200);
    expect(String(u.args[0])).not.toContain("\u0007");
    expect(u.args[1]).toBe("acme.com");
  });

  it("with no note it only stamps the attempt and leaves any earlier failure reason alone", async () => {
    const { env, log } = makeEnv();
    await markToolAttempt(env, "acme.com");
    expect(log[0].sql).not.toContain("last_check_note");
  });
});

describe("runDueRechecks with bad stored data", () => {
  it("notes and skips a tool whose source list is malformed, and still handles the next tool and the run", async () => {
    const bad = { id: 1, domain: "bad.com", source_urls: "{not json", last_checked_at: null, last_check_note: null };
    const good = { id: 2, domain: "good.com", source_urls: JSON.stringify(["https://good.com/p"]), last_checked_at: null, last_check_note: null };
    const { env, log } = makeEnv([bad, good]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(runDueRechecks(env)).resolves.toBeUndefined();
    vi.unstubAllGlobals();

    const skipped = log.find((l) => l.sql.includes("last_check_note = ?") && String(l.args[0]).includes("no usable source page"));
    expect(skipped!.args[1]).toBe("bad.com");
    const attempted = log.filter((l) => l.sql.startsWith("UPDATE tools SET last_attempt_at") && l.args[l.args.length - 1] === "good.com");
    expect(attempted.length).toBeGreaterThan(0); // the next tool was still processed
  });
});
