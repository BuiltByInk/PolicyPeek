import { describe, it, expect, vi } from "vitest";
import type { Env } from "./index";

// 2026-10-15: a first-time domain from a batch run (hold_for_review: true) always
// queues, even when the verdict is unfavourable and would otherwise auto-publish.
vi.mock("./extraction", () => ({
  extractFacts: vi.fn(async () => ({
    trains_on_user_data: true,
    data_retention: null,
    gdpr_mentioned: true,
    opt_out_available: false,
    relevant_clauses: ["We train on your content."],
  })),
}));

const { runExtraction } = await import("./check");
const POLICY = "policy text ".repeat(100);

function makeEnv(existingTool: { id: number; compliance_status: string; source_urls: string } | null = null) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const env = {
    ANTHROPIC_API_KEY: "test-key",
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) { args = a; return st; },
          async first() { statements.push({ sql, args }); return sql.startsWith("SELECT id, compliance_status") ? existingTool : null; },
          async run() { statements.push({ sql, args }); return { success: true, meta: { changes: 1 } }; },
        };
        return st;
      },
    },
  } as unknown as Env;
  return { env, statements };
}
const published = (s: { sql: string }[]) => s.some((x) => x.sql.includes("INSERT INTO tools") || x.sql.startsWith("UPDATE tools SET compliance_status"));

describe("batch submissions hold first-time domains for review", () => {
  it("control: without the flag, an unfavourable first result auto-publishes", async () => {
    const { env, statements } = makeEnv();
    await runExtraction(env, 1, "acme.com", null, "https://acme.com/privacy", false, false, false, POLICY, null);
    expect(published(statements)).toBe(true);
  });

  it("with hold_for_review, the same first result is queued with a reason and nothing is published", async () => {
    const { env, statements } = makeEnv();
    await runExtraction(env, 2, "acme.com", null, "https://acme.com/privacy", false, false, false, POLICY, null, false, true);
    expect(published(statements)).toBe(false);
    const note = statements.find((s) => s.sql.startsWith("UPDATE pending_checks SET extraction_error"));
    expect(String(note!.args[0])).toContain("batch submission");
  });

  it("the flag does not change behaviour for an already-published domain (normal recheck rules apply)", async () => {
    const { env, statements } = makeEnv({ id: 5, compliance_status: "not_compliant", source_urls: JSON.stringify(["https://acme.com/privacy"]) });
    await runExtraction(env, 3, "acme.com", null, "https://acme.com/privacy", true, false, false, POLICY, null, false, true);
    expect(statements.some((s) => s.sql.startsWith("UPDATE tools SET compliance_status"))).toBe(true);
  });
});
