// Minimal D1 stand-in over Node's built-in node:sqlite for unit tests (same
// approach as backend/src/submitFlow.e2e.test.ts). Supports
// prepare().bind().first/all/run, db.batch() and db.exec().
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (p: string) => any };

export interface ShimDb {
  d1: D1Database;
  raw: any;
}

function makeStmt(db: any, sql: string, args: unknown[] = []): any {
  const norm = (a: unknown[]) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  return {
    bind: (...a: unknown[]) => makeStmt(db, sql, a),
    first: async (col?: string) => {
      const row = db.prepare(sql).get(...norm(args)) ?? null;
      return col && row ? row[col] : row;
    },
    all: async () => ({ results: db.prepare(sql).all(...norm(args)), success: true, meta: {} }),
    run: async () => {
      const r = db.prepare(sql).run(...norm(args));
      return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    raw: async () => db.prepare(sql).all(...norm(args)).map((r: any) => Object.values(r)),
    _run: () => db.prepare(sql).run(...norm(args)),
  };
}

export function makeDb(...schemaFiles: string[]): ShimDb {
  const raw = new DatabaseSync(":memory:");
  for (const f of schemaFiles) raw.exec(readFileSync(f, "utf8"));
  const d1 = {
    prepare: (sql: string) => makeStmt(raw, sql),
    batch: async (stmts: any[]) => {
      raw.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) {
          const r = s._run();
          out.push({ success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } });
        }
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql: string) => { raw.exec(sql); return { count: 0, duration: 0 }; },
  } as unknown as D1Database;
  return { d1, raw };
}

// In-memory R2 stand-in: put/get/delete/list by prefix.
export function makeR2(): R2Bucket & { store: Map<string, { body: string | Uint8Array; meta?: Record<string, string> }> } {
  const store = new Map<string, { body: string | Uint8Array; meta?: Record<string, string> }>();
  const bucket = {
    store,
    put: async (key: string, body: any, opts?: any) => {
      let b: string | Uint8Array = body;
      if (body instanceof ArrayBuffer) b = new Uint8Array(body);
      store.set(key, { body: b, meta: opts?.customMetadata });
      return { key } as any;
    },
    get: async (key: string) => {
      const v = store.get(key);
      if (!v) return null;
      return {
        key,
        text: async () => (typeof v.body === "string" ? v.body : new TextDecoder().decode(v.body)),
        arrayBuffer: async () => (typeof v.body === "string" ? new TextEncoder().encode(v.body).buffer : v.body.buffer),
        customMetadata: v.meta,
      } as any;
    },
    delete: async (keys: string | string[]) => { for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k); },
    list: async (opts?: { prefix?: string }) => ({
      objects: [...store.keys()].filter((k) => !opts?.prefix || k.startsWith(opts.prefix)).sort().map((key) => ({ key })),
      truncated: false,
    }),
  };
  return bucket as any;
}
