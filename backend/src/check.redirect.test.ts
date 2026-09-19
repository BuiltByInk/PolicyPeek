import { describe, it, expect, vi } from "vitest";
import type { Env } from "./index";

// Decision 1 (2026-09-19): when a redirect carried the fetch off the
// submitted domain, the extraction is kept but never auto-publishes -- it
// lands in the admin queue with the reason in extraction_error.

vi.mock("./extraction", () => ({
  extractFacts: vi.fn(async () => ({
    trains_on_user_data: false,
    data_retention: "30 days",
    gdpr_mentioned: true,
    opt_out_available: null,
    relevant_clauses: ["We never train on your data."],
  })),
}));

const { runExtraction } = await import("./check");

function makeEnv(existingTool: { id: number; compliance_status: string; source_urls: string } | null = null) {
  const statements: { sql: string; args: unknown[] }[] = [];
  const env = {
    ANTHROPIC_API_KEY: "test-key",
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const st = {
          bind(...a: unknown[]) {
            args = a;
            return st;
          },
          async first() {
            statements.push({ sql, args });
            if (sql.startsWith("SELECT id, compliance_status")) return existingTool;
            return null;
          },
          async run() {
            statements.push({ sql, args });
            return { success: true, meta: { changes: 1 } };
          },
        };
        return st;
      },
    },
  } as unknown as Env;
  return { env, statements };
}

describe("runExtraction with an off-domain redirect", () => {
  it("does not publish and records why it was queued", async () => {
    const { env, statements } = makeEnv();
    await runExtraction(env, 42, "acme.com", null, "https://acme.com/redirect", false, false, false, "policy text", "evil.example");

    expect(statements.some((s) => s.sql.includes("INSERT INTO tools") || s.sql.includes("UPDATE tools"))).toBe(false);
    const note = statements.find((s) => s.sql.includes("SET extraction_error = ?") && String(s.args[0]).startsWith("queued_for_review"));
    expect(note).toBeDefined();
    expect(String(note!.args[0])).toContain("evil.example");
    expect(note!.args[1]).toBe(42);
  });

  it("still auto-publishes a clean extraction when no redirect left the domain", async () => {
    const { env, statements } = makeEnv();
    await runExtraction(env, 43, "acme.com", null, "https://acme.com/privacy", false, false, false, "policy text", null);

    expect(statements.some((s) => s.sql.includes("INSERT INTO tools"))).toBe(true);
  });
});

describe("runExtraction when the source host differs from the published entry's", () => {
  const existing = { id: 5, compliance_status: "compliant", source_urls: JSON.stringify(["https://acme.com/privacy"]) };

  it("queues instead of overwriting the published summary and sources, even with an unchanged verdict", async () => {
    const { env, statements } = makeEnv(existing);
    await runExtraction(env, 50, "acme.com", null, "https://tenant.acme.com/privacy", true, false, false, "policy text", null);

    expect(statements.some((s) => s.sql.includes("UPDATE tools"))).toBe(false);
    const note = statements.find((s) => s.sql.includes("SET extraction_error = ?") && String(s.args[0]).startsWith("queued_for_review"));
    expect(String(note!.args[0])).toContain("tenant.acme.com");
  });

  it("still auto-updates when the new source is on the same host", async () => {
    const { env, statements } = makeEnv(existing);
    await runExtraction(env, 51, "acme.com", null, "https://acme.com/privacy-2026", true, false, false, "policy text", null);

    expect(statements.some((s) => s.sql.includes("UPDATE tools"))).toBe(true);
  });
});

describe("runExtraction for a brand-new domain whose source is on a different host", () => {
  it("queues instead of auto-publishing (a tenant page submitted under a multi-tenant apex)", async () => {
    const { env, statements } = makeEnv(null);
    await runExtraction(env, 60, "substack.com", null, "https://someone.substack.com/privacy", false, false, false, "policy text", null);

    expect(statements.some((s) => s.sql.includes("INSERT INTO tools"))).toBe(false);
    const note = statements.find((s) => s.sql.includes("SET extraction_error = ?") && String(s.args[0]).startsWith("queued_for_review"));
    expect(String(note!.args[0])).toContain("someone.substack.com");
  });
});
