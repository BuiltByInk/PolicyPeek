import { describe, it, expect } from "vitest";
import * as NEW from "./admin";
// @ts-ignore -- temporary: compare against the pre-cleanup copy
import * as OLD from "/tmp/claude-1000/-home-jumpspot/c0b14fb7-76dd-40aa-b1ba-c79b91dbe880/scratchpad/backend-src-before-cleanup-0919/admin";

function makeEnv(existing: { id: number; compliance_status: string } | null) {
  const log: unknown[] = [];
  const env: any = {
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const st: any = {
          bind(...a: unknown[]) { args = a; return st; },
          async first() { log.push(["first", sql, args]); if (sql.startsWith("SELECT id, compliance_status")) return existing; if (sql.includes("RETURNING id")) return { id: 99 }; return null; },
          async run() { log.push(["run", sql, args]); return { success: true, meta: { changes: 1 } }; },
          async all() { log.push(["all", sql, args]); return { results: [] }; },
        };
        return st;
      },
    },
  };
  return { env, log };
}

const bools = [true, false, null] as const;
const cases: any[] = [];
for (const t of bools) for (const g of bools) for (const o of bools)
  for (const shared of [0, 1]) for (const archive of [0, 1]) for (const existing of [null, { id: 5, compliance_status: "unrated" }])
    cases.push({ t, g, o, shared, archive, existing });

describe("cleanup equivalence: admin.ts publish paths", () => {
  it(`old and new write identical SQL and binds across ${cases.length} cases`, async () => {
    for (const c of cases) {
      const pending: any = {
        id: 3, domain: "acme.com", name: "Acme", is_recheck: c.existing ? 1 : 0, status: "extracted",
        source_url: "https://acme.com/p", archived_source_url: "https://web.archive.org/x",
        shared_domain: c.shared, sourced_from_archive: c.archive,
        extracted_facts: JSON.stringify({ trains_on_user_data: c.t, data_retention: "30 days", gdpr_mentioned: c.g, opt_out_available: c.o, relevant_clauses: ["We never train.", "second"] }),
      };
      const a = makeEnv(c.existing); const b = makeEnv(c.existing);
      const ra = await (OLD as any).approvePendingCheck(a.env, pending, { autoPublished: false });
      const rb = await (NEW as any).approvePendingCheck(b.env, pending, { autoPublished: false });
      expect(rb).toEqual(ra); expect(b.log).toEqual(a.log);

      const a2 = makeEnv(c.existing); const b2 = makeEnv(c.existing);
      const r2a = await (OLD as any).tryAutoPublishAtomic(a2.env, pending, c.existing);
      const r2b = await (NEW as any).tryAutoPublishAtomic(b2.env, pending, c.existing);
      expect(r2b).toEqual(r2a); expect(b2.log).toEqual(a2.log);
    }
  });
});
