import { describe, it, expect } from "vitest";
import { cronJobFor } from "./index";

describe("cronJobFor", () => {
  it("maps each schedule in wrangler.toml to exactly one job", () => {
    expect(cronJobFor("*/15 * * * *")).toBe("stuck-check");
    expect(cronJobFor("0 3 1 * *")).toBe("monthly-recheck");
    expect(cronJobFor("30 3 * * *")).toBe("purge-ips");
  });

  it("returns null for anything else, so a typo can't silently run another job", () => {
    expect(cronJobFor("31 3 * * *")).toBeNull();
    expect(cronJobFor("")).toBeNull();
  });
});
