import { describe, it, expect } from "vitest";
import { todayBucket, nextDayResetAt, isOverGlobalCap, GLOBAL_DAILY_CHECK_CAP } from "./rateLimit";

describe("todayBucket", () => {
  it("returns the UTC calendar day as YYYY-MM-DD", () => {
    expect(todayBucket(new Date("2026-08-15T09:00:00.000Z"))).toBe("2026-08-15");
  });

  it("uses the UTC day even close to a local-time midnight boundary", () => {
    expect(todayBucket(new Date("2026-08-15T23:59:59.999Z"))).toBe("2026-08-15");
    expect(todayBucket(new Date("2026-08-16T00:00:00.000Z"))).toBe("2026-08-16");
  });
});

describe("nextDayResetAt", () => {
  it("returns UTC midnight at the start of the next day", () => {
    expect(nextDayResetAt(new Date("2026-08-15T09:00:00.000Z"))).toBe("2026-08-16T00:00:00.000Z");
  });

  it("carries across a month boundary", () => {
    expect(nextDayResetAt(new Date("2026-08-31T23:30:00.000Z"))).toBe("2026-09-01T00:00:00.000Z");
  });

  it("carries across a year boundary", () => {
    expect(nextDayResetAt(new Date("2026-12-31T12:00:00.000Z"))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("isOverGlobalCap", () => {
  it("is false up to and including the cap, true just past it", () => {
    expect(isOverGlobalCap(0)).toBe(false);
    expect(isOverGlobalCap(GLOBAL_DAILY_CHECK_CAP)).toBe(false);
    expect(isOverGlobalCap(GLOBAL_DAILY_CHECK_CAP + 1)).toBe(true);
  });

  it("uses the 200/day ceiling agreed on 2026-09-19", () => {
    expect(GLOBAL_DAILY_CHECK_CAP).toBe(200);
  });
});

describe("purgeOldAnonymousChecks", () => {
  it("deletes every day before today's UTC bucket and keeps today's", async () => {
    const calls: { sql: string; args: unknown[] }[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          const st = {
            bind(...args: unknown[]) {
              calls.push({ sql, args });
              return st;
            },
            async run() {
              return { success: true, meta: { changes: 7 } };
            },
          };
          return st;
        },
      },
    } as unknown as import("./index").Env;
    const { purgeOldAnonymousChecks } = await import("./rateLimit");
    const deleted = await purgeOldAnonymousChecks(env, new Date("2026-09-19T03:30:00.000Z"));
    expect(deleted).toBe(7);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe("DELETE FROM anonymous_check_log WHERE day_bucket < ?");
    expect(calls[0].args).toEqual(["2026-09-19"]);
  });
});
