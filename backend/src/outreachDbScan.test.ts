import { describe, it, expect, vi } from "vitest";
// Same dynamic-import pattern as submitFlow.e2e.test.ts (no @types/node here).
const NODE_FS: string = "node:fs";
const { readdirSync, readFileSync } = (await import(NODE_FS)) as {
  readdirSync: (p: URL) => string[];
  readFileSync: (p: URL, enc: "utf8") => string;
};

// Security conditions for the OUTREACH_DB binding (18 Nov). Static scan over
// backend/src. Any change that touches OUTREACH_DB goes to Security review.
const SRC = new URL("./", (import.meta as unknown as { url: string }).url);
const files = readdirSync(SRC).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));
const read = (f: string) => readFileSync(new URL(f, SRC), "utf8");
// Strip // and /* */ comments so prose mentions don't count as references.
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("OUTREACH_DB access rules", () => {
  it("is referenced only in heldDetail.ts (plus the Env type declaration in index.ts)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f === "heldDetail.ts") continue;
      const lines = code(read(f)).split("\n").filter((l) => l.includes("OUTREACH_DB"));
      for (const l of lines) {
        if (f === "index.ts" && l.trim() === "OUTREACH_DB?: D1Database;") continue;
        offenders.push(`${f}: ${l.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is used in heldDetail.ts only as a presence check or .prepare() with a fixed SELECT string literal", () => {
    const src = code(read("heldDetail.ts"));
    const uses = [...src.matchAll(/OUTREACH_DB/g)].map((m) => src.slice(m.index!, m.index! + 400));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      if (/^OUTREACH_DB\)/.test(u)) continue; // `if (!env.OUTREACH_DB)` presence check
      // .prepare( then ONE double-quoted literal (no backticks, no ${}, no +), then ')'
      const m = u.match(/^OUTREACH_DB\.prepare\(\s*"([^"\\]*)"\s*\)/);
      expect(m, `unsafe OUTREACH_DB use: ${u.slice(0, 120)}`).not.toBeNull();
      expect(m![1]).toMatch(/^SELECT\s/);
      expect(m![1]).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|PRAGMA)\b/i);
    }
    // no other way to reach the binding (aliasing, bracket access, destructuring)
    expect(src).not.toMatch(/\[\s*["'`]OUTREACH_DB["'`]\s*\]/);
    expect(src).not.toMatch(/\{\s*[^}]*\bOUTREACH_DB\b[^}]*\}\s*=\s*env/);
    expect(src).not.toMatch(/=\s*env\.OUTREACH_DB\s*[;,)]/);
  });

  it("heldDetail.ts has no fetch or HTTP handling, and only heldAlert.ts imports it", () => {
    const src = code(read("heldDetail.ts"));
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/\bnew\s+(Request|Response)\b|Response\.json|\bRequest\b/);
    const importers = files.filter((f: string) => f !== "heldDetail.ts" && /from\s+["']\.\/heldDetail["']/.test(read(f)));
    expect(importers).toEqual(["heldAlert.ts"]);
  });

  it("the request path never asks for outreach data: only the scheduled recheck does", () => {
    const alert = code(read("heldAlert.ts"));
    // the one detail load in the instant alert is gated on opts.scheduled === true
    expect(alert).toMatch(/loadHeldItems\(env, row\.domain, \{ withOutreach: opts\.scheduled === true \}\)/);
    // handleAlertTest (the only HTTP route in heldAlert.ts) loads nothing
    const test = alert.slice(alert.indexOf("export async function handleAlertTest"));
    expect(test).not.toMatch(/loadHeldItems|loadOutreach/);
    // check.ts passes the scheduled flag through; the /v1/check call site passes a literal false
    const check = code(read("check.ts"));
    expect(check).toMatch(/maybeAlertHeldCheck\(env, \{[^}]*\}, \{ scheduled: scheduledRecheck \}\)/);
    const callSite = check.slice(check.indexOf("ctx.waitUntil(\n    runExtraction("));
    expect(callSite.slice(0, 400)).toMatch(/fetched\.redirectedOffDomainTo,\s*false,/);
    // no route module imports the outreach loader
    for (const f of files) {
      if (f === "heldDetail.ts") continue;
      expect(code(read(f)), f).not.toMatch(/\bloadOutreach\b/);
    }
  });
});

describe("OUTREACH_DB at runtime", () => {
  it("a request-triggered held alert never touches OUTREACH_DB; a scheduled one does", async () => {
    const { maybeAlertHeldCheck } = await import("./heldAlert");
    let touched = 0;
    const outreach = new Proxy({}, { get() { touched += 1; return () => { throw new Error("touched"); }; } });
    const row = {
      id: 1, domain: "x.com", name: null, is_recheck: 0, source_url: "https://x.com/p", archived_source_url: null,
      sourced_from_archive: 0, shared_domain: 0, extracted_facts: JSON.stringify({ trains_on_user_data: null, opt_out_available: null, gdpr_mentioned: null, data_retention: null, relevant_clauses: [] }),
      extraction_error: null, created_at: "2026-11-18T04:00:00.000Z", updated_at: "2026-11-18T04:00:00.000Z", raw_fetch: "t",
    };
    const sent: Array<{ text: string }> = [];
    const env = {
      ALERT_EMAIL: { send: async (m: { text: string }) => { sent.push(m); return {}; } },
      OUTREACH_DB: outreach,
      DB: { prepare(sql: string) { const st = { bind: () => st, first: async () => ({ status: "extracted" }), all: async () => ({ results: sql.includes("FROM tools") ? [] : [row] }) }; return st; } },
    } as never;
    await maybeAlertHeldCheck(env, { id: 1, domain: "x.com" });
    expect(touched).toBe(0);
    expect(sent[0].text).toContain("Clarification email: shown in the daily digest");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await maybeAlertHeldCheck(env, { id: 1, domain: "x.com" }, { scheduled: true });
    expect(touched).toBeGreaterThan(0);
  });
});
