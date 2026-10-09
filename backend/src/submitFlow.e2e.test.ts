import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { Env } from "./index";
import type { ExtractedFacts } from "./extraction";

// End-to-end coverage of the "submit a new site" flow, 2026-10-09:
//
//   POST /v1/check -> handleCheck -> pending_checks row -> runExtraction
//   (ctx.waitUntil) -> auto-publish OR queue -> GET /v1/admin/pending ->
//   POST /v1/admin/pending/:id/approve -> GET /v1/lookup
//
// Unlike the other check tests, the database here is the real schema.sql in
// an in-memory SQLite (Node's built-in node:sqlite, no extra dependency),
// behind a minimal D1-shaped wrapper, so constraints, ON CONFLICT, RETURNING
// and the changelog triggers all behave as they would in D1. The real
// worker entry point (index.ts) routes every request, and the real SSRF
// wrapper runs. Only two things are faked: outbound fetch (DNS-over-HTTPS,
// the policy pages, archive.org) and the LLM call (extractFacts), since both
// are external services.

let DatabaseSync: (new (path: string) => SqliteDb) | null = null;
try {
  ({ DatabaseSync } = (await import("node:sqlite")) as unknown as { DatabaseSync: new (path: string) => SqliteDb });
} catch {
  // Node older than 22.5 has no node:sqlite; the suite below is skipped.
}

interface SqliteStmt {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number | bigint };
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStmt;
}

// Just enough of the D1 API for the code under test: prepare().bind().first/all/run.
function d1Over(db: SqliteDb): D1Database {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const st = {
        bind(...a: unknown[]) {
          args = a;
          return st;
        },
        async first<T>() {
          return ((db.prepare(sql).get(...args) as T | undefined) ?? null) as T | null;
        },
        async all<T>() {
          return { results: db.prepare(sql).all(...args) as T[], success: true, meta: {} };
        },
        async run() {
          const r = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
      };
      return st;
    },
  } as unknown as D1Database;
}

const SCHEMA = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
const ADMIN_TOKEN = "test-admin-token-0123456789abcdef";

// --- fake outside world ------------------------------------------------------

// hostname -> A records the fake DNS-over-HTTPS resolver answers with.
let dns: Record<string, string[]> = {};
// full URL -> response the fake web server gives.
let pages: Record<string, () => Response> = {};
// domain -> what the fake LLM "extracts" from that domain's policy.
let factsByDomain: Record<string, ExtractedFacts> = {};
let dohDown = false;

const policyHtml = (words: string) =>
  `<html><head><title>Privacy</title></head><body><main><h1>Privacy policy</h1><p>${words}</p></main></body></html>`;

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "cloudflare-dns.com") {
    if (dohDown) return Promise.resolve(new Response("upstream error", { status: 503 }));
    const name = url.searchParams.get("name") ?? "";
    const type = url.searchParams.get("type");
    const answers = type === "A" ? (dns[name] ?? []).map((data) => ({ type: 1, data })) : [];
    return Promise.resolve(Response.json({ Answer: answers }));
  }
  if (url.hostname === "archive.org") {
    return Promise.resolve(Response.json({ archived_snapshots: {} }));
  }
  const page = pages[url.href];
  if (!page) return Promise.reject(new TypeError("fetch failed: connection refused"));
  return Promise.resolve(page());
}

vi.mock("./extraction", () => ({
  extractFacts: vi.fn(async (text: string) => {
    const domain = Object.keys(factsByDomain).find((d) => text.includes(`[${d}]`));
    if (!domain) throw new Error("test: no facts registered for this text");
    return factsByDomain[domain];
  }),
}));

const worker = (await import("./index")).default;

// --- helpers -------------------------------------------------------------------

const NOT_COMPLIANT: ExtractedFacts = {
  trains_on_user_data: true,
  opt_out_available: false,
  gdpr_mentioned: true,
  data_retention: null,
  relevant_clauses: ["We use your content to train our models."],
};
const COMPLIANT: ExtractedFacts = {
  trains_on_user_data: false,
  opt_out_available: null,
  gdpr_mentioned: true,
  data_retention: "30 days",
  relevant_clauses: ["We never use customer content to train models."],
};

// Registers a reachable policy page for a domain: public DNS, a 200 page whose
// text carries a [domain] marker, and the facts the fake LLM returns for it.
function sitePolicy(domain: string, url: string, facts: ExtractedFacts) {
  dns[new URL(url).hostname] = ["93.184.216.34"];
  pages[url] = () => new Response(policyHtml(`[${domain}] policy text`), { status: 200 });
  factsByDomain[domain] = facts;
}

function makeWorld() {
  if (!DatabaseSync) throw new Error("unreachable: suite is skipped without node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  const env = { DB: d1Over(db), ANTHROPIC_API_KEY: "test-key", ADMIN_TOKEN } as Env;
  const background: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void background.push(p),
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  async function call(path: string, init: RequestInit & { ip?: string } = {}) {
    const headers = new Headers(init.headers);
    headers.set("CF-Connecting-IP", init.ip ?? "203.0.113.10");
    const res = await worker.fetch(new Request(`https://api.test${path}`, { ...init, headers }), env, ctx);
    // Let the background extraction finish, as the Worker runtime would.
    await Promise.all(background.splice(0));
    return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
  }

  return {
    db,
    submit: (body: unknown, ip?: string) =>
      call("/v1/check", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, ip }),
    lookup: (domain: string) => call(`/v1/lookup?domain=${encodeURIComponent(domain)}`),
    pending: () => call("/v1/admin/pending", { headers: { "X-Admin-Token": ADMIN_TOKEN } }),
    approve: (id: number) => call(`/v1/admin/pending/${id}/approve`, { method: "POST", headers: { "X-Admin-Token": ADMIN_TOKEN } }),
    slotsUsed: () => (db.prepare("SELECT COUNT(*) AS n FROM anonymous_check_log").get() as { n: number }).n,
    pendingRows: () => db.prepare("SELECT * FROM pending_checks ORDER BY id").all() as Record<string, any>[],
  };
}

// --- tests ---------------------------------------------------------------------

describe.skipIf(!DatabaseSync)("submit flow, end to end", () => {
  beforeEach(() => {
    dns = {};
    pages = {};
    factsByDomain = {};
    dohDown = false;
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valid new domain, unfavourable result: accepted, auto-published, visible in lookup", async () => {
    const w = makeWorld();
    sitePolicy("acme-ai.com", "https://acme-ai.com/privacy", NOT_COMPLIANT);

    const res = await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" });
    expect(res.status).toBe(202);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.body).toMatchObject({ domain: "acme-ai.com", status: "pending", is_recheck: false });

    const look = await w.lookup("acme-ai.com");
    expect(look.status).toBe(200);
    // The website's poll only accepts a hit whose matched_domain equals what it submitted.
    expect(look.body).toMatchObject({ matched_domain: "acme-ai.com", compliance_status: "not_compliant" });
    expect(w.pendingRows()[0].status).toBe("approved");
    expect(w.slotsUsed()).toBe(1);
  });

  it("valid new domain, favourable result: queued with a reason, published only after admin approve", async () => {
    const w = makeWorld();
    sitePolicy("goodtool.io", "https://goodtool.io/legal/privacy", COMPLIANT);

    const res = await w.submit({ domain: "goodtool.io", source_url: "https://goodtool.io/legal/privacy" });
    expect(res.status).toBe(202);
    expect((await w.lookup("goodtool.io")).status).toBe(404);

    const queue = await w.pending();
    expect(queue.body.pending_checks).toHaveLength(1);
    const row = queue.body.pending_checks[0];
    expect(row).toMatchObject({ domain: "goodtool.io", status: "extracted" });
    expect(row.queue_reason).toContain("brand-new domain with a favourable verdict");

    const approved = await w.approve(row.id);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ domain: "goodtool.io", compliance_status: "compliant" });
    expect((await w.lookup("goodtool.io")).body).toMatchObject({ matched_domain: "goodtool.io", compliance_status: "compliant" });
  });

  it("policy link on a subdomain (the midjourney.com / docs.midjourney.com case) is accepted, then queued for a person", async () => {
    const w = makeWorld();
    sitePolicy("midjourney.com", "https://docs.midjourney.com/hc/en-us/articles/privacy", NOT_COMPLIANT);

    const res = await w.submit({ domain: "midjourney.com", source_url: "https://docs.midjourney.com/hc/en-us/articles/privacy" });
    expect(res.status).toBe(202);

    // A first source on another host never auto-publishes (security review H2),
    // even with an unfavourable verdict: it waits with the reason stated.
    const row = (await w.pending()).body.pending_checks[0];
    expect(row.queue_reason).toContain("docs.midjourney.com");
    expect((await w.approve(row.id)).body).toMatchObject({ compliance_status: "not_compliant" });
    expect((await w.lookup("midjourney.com")).body.compliance_status).toBe("not_compliant");
  });

  it("www. policy link for a bare domain still auto-publishes", async () => {
    const w = makeWorld();
    sitePolicy("wwwtool.com", "https://www.wwwtool.com/privacy", NOT_COMPLIANT);
    expect((await w.submit({ domain: "wwwtool.com", source_url: "https://www.wwwtool.com/privacy" })).status).toBe(202);
    expect((await w.lookup("wwwtool.com")).body.compliance_status).toBe("not_compliant");
  });

  it("invalid domain or mismatched link: 400 with a specific error, nothing queued, daily check not used", async () => {
    const w = makeWorld();
    const cases: [unknown, string][] = [
      [{ domain: "not a domain", source_url: "https://x.com/p" }, "invalid_domain"],
      [{ domain: "localhost", source_url: "http://localhost/p" }, "invalid_domain"],
      [{ domain: "github.io", source_url: "https://evil.github.io/p" }, "invalid_domain"],
      [{ domain: "acme.com" }, "missing_source_url"],
      [{ domain: "acme.com", source_url: "not a url" }, "invalid_source_url"],
      [{ domain: "acme.com", source_url: "https://evil-acme.com/privacy" }, "source_url_domain_mismatch"],
      [{ domain: "app.acme.com", source_url: "https://acme.com/privacy" }, "source_url_domain_mismatch"],
      [[], "invalid_json"],
    ];
    for (const [body, error] of cases) {
      const res = await w.submit(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe(error);
    }
    expect(w.pendingRows()).toHaveLength(0);
    expect(w.slotsUsed()).toBe(0);
  });

  it("SSRF: a policy host that resolves to a private address is refused as blocked_url and the check is given back", async () => {
    const w = makeWorld();
    dns["intranet.acme.com"] = ["10.0.0.7"];
    const res = await w.submit({ domain: "acme.com", source_url: "https://intranet.acme.com/privacy" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "blocked_url", reason: "blocked_target_resolved_ip" });
    expect(w.pendingRows()).toHaveLength(0);
    expect(w.slotsUsed()).toBe(0);
  });

  it("SSRF: a redirect to the cloud metadata address is refused mid-chain", async () => {
    const w = makeWorld();
    dns["acme.com"] = ["93.184.216.34"];
    pages["https://acme.com/privacy"] = () =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
    const res = await w.submit({ domain: "acme.com", source_url: "https://acme.com/privacy" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "blocked_url", reason: "blocked_target" });
    expect(w.slotsUsed()).toBe(0);
  });

  it("SSRF: a non-web port is refused", async () => {
    const w = makeWorld();
    const res = await w.submit({ domain: "acme.com", source_url: "https://acme.com:8443/privacy" });
    expect(res.body).toMatchObject({ error: "blocked_url", reason: "blocked_port" });
    expect(w.slotsUsed()).toBe(0);
  });

  it("DNS lookup service down: refused (fails closed) with reason dns_resolution_failed, so the site can say 'try again'", async () => {
    const w = makeWorld();
    dohDown = true;
    const res = await w.submit({ domain: "acme.com", source_url: "https://acme.com/privacy" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "blocked_url", reason: "dns_resolution_failed" });
    expect(w.slotsUsed()).toBe(0);
  });

  it("fetch failure (server error, no archive copy): 502 fetch_failed, nothing queued, check given back", async () => {
    const w = makeWorld();
    dns["acme.com"] = ["93.184.216.34"];
    pages["https://acme.com/privacy"] = () => new Response("oops", { status: 500 });
    const res = await w.submit({ domain: "acme.com", source_url: "https://acme.com/privacy" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("fetch_failed");
    expect(w.pendingRows()).toHaveLength(0);
    expect(w.slotsUsed()).toBe(0);
  });

  it("fetch failure (host unreachable): 502 fetch_failed, check given back", async () => {
    const w = makeWorld();
    dns["down.example"] = ["93.184.216.34"];
    const res = await w.submit({ domain: "down.example", source_url: "https://down.example/privacy" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("fetch_failed");
    expect(w.slotsUsed()).toBe(0);
  });

  it("duplicate submission of an already-published domain: accepted as a recheck, verdict unchanged, no duplicate audit row", async () => {
    const w = makeWorld();
    sitePolicy("acme-ai.com", "https://acme-ai.com/privacy", NOT_COMPLIANT);
    await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" }, "203.0.113.1");
    const changelogBefore = (w.db.prepare("SELECT COUNT(*) AS n FROM compliance_changelog").get() as { n: number }).n;

    const again = await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" }, "203.0.113.2");
    expect(again.status).toBe(202);
    expect(again.body.is_recheck).toBe(true);
    expect((await w.lookup("acme-ai.com")).body.compliance_status).toBe("not_compliant");
    expect((w.db.prepare("SELECT COUNT(*) AS n FROM tools").get() as { n: number }).n).toBe(1);
    expect((w.db.prepare("SELECT COUNT(*) AS n FROM compliance_changelog").get() as { n: number }).n).toBe(changelogBefore);
  });

  it("duplicate submission while the first is still waiting for a person: both are queued (current behaviour, see DECISIONS_NEEDED.md)", async () => {
    const w = makeWorld();
    sitePolicy("goodtool.io", "https://goodtool.io/privacy", COMPLIANT);
    await w.submit({ domain: "goodtool.io", source_url: "https://goodtool.io/privacy" }, "203.0.113.1");
    const again = await w.submit({ domain: "goodtool.io", source_url: "https://goodtool.io/privacy" }, "203.0.113.2");
    expect(again.status).toBe(202);
    expect(again.body.is_recheck).toBe(false);

    const queue = (await w.pending()).body.pending_checks;
    expect(queue).toHaveLength(2);
    // Approving either one publishes; approving the other afterwards is a same-verdict no-op update.
    expect((await w.approve(queue[0].id)).status).toBe(200);
    expect((await w.approve(queue[1].id)).status).toBe(200);
    expect((w.db.prepare("SELECT COUNT(*) AS n FROM tools").get() as { n: number }).n).toBe(1);
  });

  it("rate limit: second check from the same client the same day is refused with 429, a reset time and Retry-After", async () => {
    const w = makeWorld();
    sitePolicy("acme-ai.com", "https://acme-ai.com/privacy", NOT_COMPLIANT);
    sitePolicy("other-ai.com", "https://other-ai.com/privacy", NOT_COMPLIANT);

    expect((await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" })).status).toBe(202);
    const second = await w.submit({ domain: "other-ai.com", source_url: "https://other-ai.com/privacy" });
    expect(second.status).toBe(429);
    expect(second.body.error).toBe("daily_check_limit_reached");
    expect(typeof second.body.resets_at).toBe("string");
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
    // A 429 must still be readable from the website's origin.
    expect(second.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await w.lookup("other-ai.com")).status).toBe(404);
  });

  it("a failed check does not use up the day: the same client can submit again after a fetch failure", async () => {
    const w = makeWorld();
    dns["down.example"] = ["93.184.216.34"];
    expect((await w.submit({ domain: "down.example", source_url: "https://down.example/privacy" })).status).toBe(502);
    sitePolicy("acme-ai.com", "https://acme-ai.com/privacy", NOT_COMPLIANT);
    expect((await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" })).status).toBe(202);
  });

  it("extraction failure after the 202: the row stays in the queue with the error, nothing is published", async () => {
    const w = makeWorld();
    dns["acme-ai.com"] = ["93.184.216.34"];
    pages["https://acme-ai.com/privacy"] = () => new Response(policyHtml("[unregistered] policy text"), { status: 200 });

    expect((await w.submit({ domain: "acme-ai.com", source_url: "https://acme-ai.com/privacy" })).status).toBe(202);
    const row = (await w.pending()).body.pending_checks[0];
    expect(row.status).toBe("pending");
    expect(row.extraction_error).toContain("no facts registered");
    expect((await w.approve(row.id)).body.error).toBe("not_yet_extracted");
    expect((await w.lookup("acme-ai.com")).status).toBe(404);
  });
});
