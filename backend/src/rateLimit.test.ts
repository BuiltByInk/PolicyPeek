import { describe, it, expect } from "vitest";
import { windowResetAt } from "./rateLimit";

describe("windowResetAt", () => {
  it("adds 24 hours to the first check's timestamp", () => {
    expect(windowResetAt("2026-08-15T09:00:00.000Z")).toBe("2026-08-16T09:00:00.000Z");
  });

  it("carries across a day/month boundary", () => {
    expect(windowResetAt("2026-08-31T23:30:00.000Z")).toBe("2026-09-01T23:30:00.000Z");
  });
});
