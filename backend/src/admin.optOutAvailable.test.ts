import { describe, it, expect } from "vitest";
import { tryAutoPublishAtomic } from "./admin";
import type { Env } from "./index";

// Regression test for Phase 2.5i: opt_out_available used to be read from
// extracted_facts in-memory only, never persisted to the tools row itself
// (see DECISIONS_NEEDED.md / the 2026-09-13 audit). This confirms the
// value now reaches the UPDATE statement's bound args.

function makeFakeEnv() {
  let capturedUpdateArgs: unknown[] | null = null;
  const tools = new Map<number, { id: number; compliance_status: string }>();
  tools.set(1, { id: 1, compliance_status: "not_compliant" });

  function prepare(sql: string) {
    let boundArgs: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        boundArgs = args;
        return statement;
      },
      async first<T>() {
        return null as T | null;
      },
      async run() {
        if (sql.startsWith("UPDATE tools")) {
          capturedUpdateArgs = boundArgs;
          const id = boundArgs[boundArgs.length - 2] as number;
          const expectedStatus = boundArgs[boundArgs.length - 1] as string;
          const row = tools.get(id);
          if (row && row.compliance_status === expectedStatus) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (sql.startsWith("INSERT INTO compliance_changelog")) {
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return statement;
  }

  const env = { DB: { prepare } as unknown as Env["DB"] } as Env;
  return { env, getCapturedUpdateArgs: () => capturedUpdateArgs };
}

describe("tryAutoPublishAtomic persists opt_out_available", () => {
  it("binds the extracted opt_out_available fact (as 0/1) into the UPDATE", async () => {
    const { env, getCapturedUpdateArgs } = makeFakeEnv();
    const freshRead = { id: 1, compliance_status: "not_compliant" };
    const pending = {
      id: 55,
      domain: "example.com",
      name: "Example",
      is_recheck: 1,
      status: "extracted",
      source_url: "https://example.com/privacy",
      extracted_facts: JSON.stringify({
        trains_on_user_data: true,
        data_retention: null,
        gdpr_mentioned: null,
        opt_out_available: true,
        relevant_clauses: ["You may opt out of training."],
      }),
      shared_domain: 0,
      sourced_from_archive: 0,
    };

    const result = await tryAutoPublishAtomic(env, pending, freshRead);

    expect(result.published).toBe(true);
    expect(result.verdict).toBe("compliant_with_caveats");
    expect(getCapturedUpdateArgs()).toContain(1); // opt_out_available bound as 1, not just used in-memory
  });

  it("binds null when opt_out_available is not stated", async () => {
    const { env, getCapturedUpdateArgs } = makeFakeEnv();
    const freshRead = { id: 1, compliance_status: "not_compliant" };
    const pending = {
      id: 56,
      domain: "example.com",
      name: "Example",
      is_recheck: 1,
      status: "extracted",
      source_url: "https://example.com/privacy",
      extracted_facts: JSON.stringify({
        trains_on_user_data: false,
        data_retention: null,
        gdpr_mentioned: null,
        opt_out_available: null,
        relevant_clauses: [],
      }),
      shared_domain: 0,
      sourced_from_archive: 0,
    };

    await tryAutoPublishAtomic(env, pending, freshRead);

    const args = getCapturedUpdateArgs();
    // opt_out_available is the 5th bound value (verdict, data_retention,
    // trains_on_user_data, gdpr_mentioned, opt_out_available, ...).
    expect(args?.[4]).toBeNull();
  });
});
