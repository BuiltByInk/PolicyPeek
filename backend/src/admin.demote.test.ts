import { describe, it, expect } from "vitest";
import type { Env } from "./index";
import { handleDemote } from "./admin";

interface Tool {
  id: number;
  domain: string;
  compliance_status: string;
  trains_on_user_data: number | null;
  opt_out_available: number | null;
}

function makeEnv(tool: Tool | null, { changes = 1 }: { changes?: number } = {}) {
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
          async first() {
            log.push({ sql, args });
            return tool;
          },
          async run() {
            log.push({ sql, args });
            return { success: true, meta: { changes } };
          },
        };
        return st;
      },
    },
  } as unknown as Env;
  return { env, log };
}

const req = (body: unknown) =>
  new Request("https://x/v1/admin/tools/5/demote", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

const compliant: Tool = { id: 5, domain: "notion.com", compliance_status: "compliant", trains_on_user_data: 0, opt_out_available: null };

describe("handleDemote", () => {
  it("demotes to unrated, clears the training facts, and records the reason and old values", async () => {
    const { env, log } = makeEnv(compliant);
    const res = await handleDemote(req({ reason: "Stored clause covers only Google Workspace API data" }), env, 5);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tool_id: 5, domain: "notion.com", old_status: "compliant", new_status: "unrated" });

    const update = log.find((l) => l.sql.startsWith("UPDATE tools"))!;
    expect(update.sql).toContain("compliance_status = 'unrated'");
    expect(update.sql).toContain("trains_on_user_data = NULL");
    expect(update.args).toEqual([5, "compliant"]); // compare-and-swap on the status that was read

    const audit = log.find((l) => l.sql.includes("INSERT INTO compliance_changelog"))!;
    expect(audit.args[0]).toBe(5);
    expect(audit.args[1]).toBe("compliant");
    expect(String(audit.args[2])).toContain("demoted by admin: Stored clause covers only Google Workspace API data");
    expect(String(audit.args[2])).toContain("was compliant, trains=0, opt_out=null");
  });

  it("requires a reason (missing, blank, wrong type or malformed body)", async () => {
    for (const body of [{}, { reason: "   " }, { reason: 42 }, "not json", null]) {
      const { env, log } = makeEnv(compliant);
      const res = await handleDemote(req(body as never), env, 5);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "reason_required" });
      expect(log).toHaveLength(0);
    }
  });

  it("404s for an unknown tool and 409s for one that is already unrated, writing nothing", async () => {
    const missing = makeEnv(null);
    expect((await handleDemote(req({ reason: "x" }), missing.env, 9)).status).toBe(404);

    const already = makeEnv({ ...compliant, compliance_status: "unrated" });
    const res = await handleDemote(req({ reason: "x" }), already.env, 5);
    expect(res.status).toBe(409);
    expect(already.log.some((l) => l.sql.startsWith("UPDATE"))).toBe(false);
  });

  it("does not overwrite if the status changed after it was read, and writes no audit row", async () => {
    const { env, log } = makeEnv(compliant, { changes: 0 });
    const res = await handleDemote(req({ reason: "x" }), env, 5);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "status_changed_meanwhile" });
    expect(log.some((l) => l.sql.includes("INSERT INTO compliance_changelog"))).toBe(false);
  });

  it("cleans and caps the reason", async () => {
    const { env, log } = makeEnv(compliant);
    await handleDemote(req({ reason: "bad\u0007 reason " + "x".repeat(1000) }), env, 5);
    const audit = log.find((l) => l.sql.includes("INSERT INTO compliance_changelog"))!;
    expect(String(audit.args[2]).length).toBeLessThan(450);
    expect(String(audit.args[2])).not.toContain("\u0007");
  });
});

describe("demote route", () => {
  it("is admin-only: 401 without the token, and reaches the handler with it", async () => {
    const worker = (await import("./index")).default;
    const { env } = makeEnv(compliant);
    const withSecret = { ...env, ADMIN_TOKEN: "test-admin-token" } as Env;
    const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

    const noToken = await worker.fetch(new Request("https://x/v1/admin/tools/5/demote", { method: "POST", body: "{}" }), withSecret, ctx);
    expect(noToken.status).toBe(401);

    const withToken = await worker.fetch(
      new Request("https://x/v1/admin/tools/5/demote", { method: "POST", headers: { "X-Admin-Token": "test-admin-token" }, body: "{}" }),
      withSecret,
      ctx
    );
    expect(withToken.status).toBe(400); // reached the handler; no reason given

    const wrongMethod = await worker.fetch(
      new Request("https://x/v1/admin/tools/5/demote", { method: "GET", headers: { "X-Admin-Token": "test-admin-token" } }),
      withSecret,
      ctx
    );
    expect(wrongMethod.status).toBe(404);
  });
});
