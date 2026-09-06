import { describe, it, expect } from "vitest";
import { todayBucket, nextDayResetAt } from "./rateLimit";

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
