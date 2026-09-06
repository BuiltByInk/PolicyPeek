import { describe, it, expect } from "vitest";
import { tryAutoPublishAtomic } from "./admin";
import type { Env } from "./index";

// Regression test for the 2026-09-06 Low finding (see DECISIONS_NEEDED.md /
// security/review-2026-09-06-concurrency.md finding #3): concurrent
// duplicate submissions of a domain that all resolve to the *same* verdict
// as what's already published each used to log their own
// "auto-published from pending_check #N" compliance_changelog row, even
// though nothing actually changed -- the compare-and-swap WHERE clause in
// tryAutoPublishAtomic still matches when the value being swapped is
// unchanged, so every racer's write legitimately succeeds. The fix gates
// the explicit changelog insert on old_status !== new_status, mirroring the
// DB trigger's own `WHERE OLD.compliance_status IS NOT NEW.compliance_status`
// guard.

const extractedFacts = JSON.stringify({
  trains_on_user_data: false,
  data_retention: "90 days",
  gdpr_mentioned: true,
  opt_out_available: null,
  relevant_clauses: ["We do not train on your content."],
});

function makeFakeEnv(initialStatus: string) {
  const changelogRows: { tool_id: number; old_status: string | null; new_status: string; note: string }[] = [];
  const tools = new Map<number, { id: number; compliance_status: string }>();
  tools.set(1, { id: 1, compliance_status: initialStatus });

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
          const id = boundArgs[boundArgs.length - 2] as number;
          const expectedStatus = boundArgs[boundArgs.length - 1] as string;
          const row = tools.get(id);
          if (row && row.compliance_status === expectedStatus) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (sql.startsWith("INSERT INTO compliance_changelog")) {
          const [toolId, oldStatus, newStatus, note] = boundArgs as [number, string | null, string, string];
          changelogRows.push({ tool_id: toolId, old_status: oldStatus, new_status: newStatus, note });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    };
    return statement;
  }

  const env = { DB: { prepare } as unknown as Env["DB"] } as Env;
  return { env, changelogRows };
}

describe("tryAutoPublishAtomic changelog logging", () => {
  it("does not log a changelog row when the recheck resolves to the same verdict as before", async () => {
    const { env, changelogRows } = makeFakeEnv("compliant");
    const freshRead = { id: 1, compliance_status: "compliant" };
    const pending = {
      id: 42,
      domain: "kagi.com",
      name: "Kagi",
      is_recheck: 1,
      status: "extracted",
      source_url: "https://kagi.com/privacy",
      extracted_facts: extractedFacts,
      shared_domain: 0,
      sourced_from_archive: 0,
    };

    const result = await tryAutoPublishAtomic(env, pending, freshRead);

    expect(result.published).toBe(true);
    expect(result.verdict).toBe("compliant");
    expect(changelogRows).toHaveLength(0);
  });

  it("still logs a changelog row when the recheck's verdict genuinely differs from before", async () => {
    const { env, changelogRows } = makeFakeEnv("not_compliant");
    const freshRead = { id: 1, compliance_status: "not_compliant" };
    const pending = {
      id: 43,
      domain: "kagi.com",
      name: "Kagi",
      is_recheck: 1,
      status: "extracted",
      source_url: "https://kagi.com/privacy",
      extracted_facts: extractedFacts,
      shared_domain: 0,
      sourced_from_archive: 0,
    };

    const result = await tryAutoPublishAtomic(env, pending, freshRead);

    expect(result.published).toBe(true);
    expect(result.verdict).toBe("compliant");
    expect(changelogRows).toHaveLength(1);
    expect(changelogRows[0]).toMatchObject({ old_status: "not_compliant", new_status: "compliant" });
  });
});
