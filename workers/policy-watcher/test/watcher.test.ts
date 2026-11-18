import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDb, makeR2 } from "../../test-utils/d1shim";
import { normaliseHtml, sha256Hex, unifiedDiff } from "../src/normalise";
import { isAllowed } from "../src/robots";
import { checkTarget, contentKind, MAX_LLM_CALLS_PER_RUN, onPinnedHost, runAll, USER_AGENT, type Deps } from "../src/watch";

const MIG = new URL("../migrations/0001_watcher.sql", import.meta.url).pathname;
const MIG2 = new URL("../migrations/0002_gate_and_queue.sql", import.meta.url).pathname;
const POLICY = "<html><head><title>x</title><script>var t=Date.now()</script></head><body><nav>Home | Pricing</nav><main><h1>Privacy Policy</h1><p>Last updated 2026-11-10 10:31</p><p>We collect account data.&nbsp; We do not sell it.</p>" + "<p>Section text that is long enough to count as real content for the thin-content check.</p>".repeat(4) + "</main><footer>© 2026 Example</footer></body></html>";

function res(body: string, o: { status?: number; ct?: string; finalUrl?: string } = {}) {
  return { status: o.status ?? 200, bytes: new TextEncoder().encode(body), finalUrl: o.finalUrl ?? "https://example.com/privacy", contentType: o.ct ?? "text/html; charset=utf-8", truncated: false };
}

let env: any, deps: Deps & { fetch: any; sleep: any };
beforeEach(() => {
  const db = makeDb(MIG, MIG2);
  env = { DB: db.d1, SNAPSHOTS: makeR2(), raw: db.raw };
  deps = { fetch: vi.fn(), sleep: vi.fn(async () => {}), now: () => new Date("2026-11-11T02:00:00Z") };
});
const target = { id: 1, tool_slug: "example.com", policy_url: "https://example.com/privacy", pinned_host: "example.com" };

describe("normalise / hash / diff (F7)", () => {
  it("strips scripts, nav, footer, volatile dates and collapses whitespace", () => {
    const t = normaliseHtml(POLICY);
    expect(t).toContain("Privacy Policy\nLast updated\nWe collect account data. We do not sell it.");
    expect(t).not.toMatch(/Date\.now|Pricing|© 2026|2026-11-10/);
  });
  it("same policy with a new timestamp/nonce hashes the same; a wording change doesn't", async () => {
    const a = await sha256Hex(normaliseHtml(POLICY));
    const b = await sha256Hex(normaliseHtml(POLICY.replace("2026-11-10 10:31", "2026-12-01 09:00").replace("© 2026", "© 2027")));
    const c = await sha256Hex(normaliseHtml(POLICY.replace("do not sell", "may sell")));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("unified diff with context; capped at 20 KB", () => {
    const d = unifiedDiff("a\nb\nc\nd", "a\nb\nX\nd");
    expect(d.diff).toContain("-c\n+X");
    expect(d.diff).toMatch(/^--- previous\n\+\+\+ current\n@@ -1,4 \+1,4 @@/);
    expect([d.added, d.removed]).toEqual([1, 1]);
    const big = unifiedDiff(Array.from({ length: 3000 }, (_, i) => `line ${i}`).join("\n"), Array.from({ length: 3000 }, (_, i) => `changed ${i}`).join("\n"));
    expect(big.truncated).toBe(true);
    expect(new TextEncoder().encode(big.diff).byteLength).toBeLessThan(21 * 1024);
  });
});

describe("robots.txt (F5)", () => {
  const txt = "User-agent: *\nDisallow: /private\nAllow: /private/policy$\n\nUser-agent: BadBot\nDisallow: /\n";
  it("group matching, longest match, $ and *", () => {
    expect(isAllowed(txt, "/privacy")).toBe(true);
    expect(isAllowed(txt, "/private/x")).toBe(false);
    expect(isAllowed(txt, "/private/policy")).toBe(true);
    expect(isAllowed("User-agent: PolicyPeek-PolicyWatch\nDisallow: /\nUser-agent: *\nAllow: /", "/privacy")).toBe(false);
    expect(isAllowed("User-agent: *\nDisallow: /*.pdf$", "/terms.pdf")).toBe(false);
    expect(isAllowed("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });
  it("disallowed => blocked_robots, page never fetched; robots cached 24 h", async () => {
    deps.fetch.mockResolvedValueOnce(res("User-agent: *\nDisallow: /privacy", { ct: "text/plain" }));
    const r = await checkTarget(env, "r1", target, deps);
    expect(r).toMatchObject({ status: "blocked_robots", reason: "disallowed_for_our_ua" });
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    await checkTarget(env, "r2", target, deps);
    expect(deps.fetch).toHaveBeenCalledTimes(1); // cached
  });
  it("robots 404 => allow; robots 5xx => treated as disallow for this run", async () => {
    deps.fetch.mockResolvedValueOnce(res("", { status: 404 })).mockResolvedValueOnce(res(POLICY));
    expect((await checkTarget(env, "r", target, deps)).status).toBe("ok_first");
    const t2 = { ...target, tool_slug: "b.example", policy_url: "https://b.example/p", pinned_host: "b.example" };
    deps.fetch.mockResolvedValueOnce(res("", { status: 503 }));
    expect((await checkTarget(env, "r", t2, deps)).status).toBe("blocked_robots");
  });
});

describe("fetch rules (F1, F3, F4, F6, F7)", () => {
  it("https only, our UA, 10 s timeout, 500 KB cap on every fetch", async () => {
    deps.fetch.mockResolvedValueOnce(res("", { status: 404 })).mockResolvedValueOnce(res(POLICY));
    await checkTarget(env, "r", target, deps);
    for (const call of deps.fetch.mock.calls) expect(call[1]).toMatchObject({ httpsOnly: true, userAgent: USER_AGENT, timeoutMs: 10_000, maxBodyBytes: expect.any(Number) });
    expect(deps.fetch.mock.calls[1][1].maxBodyBytes).toBe(500_000);
    expect(USER_AGENT).toBe("PolicyPeek-PolicyWatch/1.0 (+https://getpolicypeek.com/about; privacy@getpolicypeek.com)");
    expect((await checkTarget(env, "r", { ...target, policy_url: "http://example.com/privacy" }, deps)).reason).toBe("not_https");
  });
  it("host pin: a redirect off the pinned host is flagged, not hashed or snapshotted", async () => {
    deps.fetch.mockResolvedValueOnce(res("", { status: 404 })).mockResolvedValueOnce(res(POLICY, { finalUrl: "https://other.example.net/privacy" }));
    const r = await checkTarget(env, "r", target, deps);
    expect(r).toMatchObject({ status: "flagged_redirect", final_host: "other.example.net" });
    expect(r.sha256).toBeUndefined();
    expect(env.SNAPSHOTS.store.size).toBe(0);
    expect(onPinnedHost("www.example.com", "example.com")).toBe(true);
    expect(onPinnedHost("legal.example.com", "example.com")).toBe(true);
    expect(onPinnedHost("example.com.evil.example", "example.com")).toBe(false);
  });
  it("a target URL not on its own pinned host is skipped (no fetch)", async () => {
    expect((await checkTarget(env, "r", { ...target, pinned_host: "other.example" }, deps)).reason).toBe("url_not_on_pinned_host");
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("content types: html, xhtml, plain and pdf only", () => {
    expect(["text/html; charset=utf-8", "application/xhtml+xml", "text/plain", "application/pdf"].map(contentKind)).toEqual(["html", "html", "text", "pdf"]);
    expect(contentKind("application/json")).toBeNull();
    expect(contentKind("image/png")).toBeNull();
  });
  it("first snapshot, unchanged, then changed with a stored diff; only the last 10 kept", async () => {
    let n = 0;
    deps.fetch.mockImplementation(async (url: string) => (url.endsWith("robots.txt") ? res("", { status: 404 }) : res(n++ < 2 ? POLICY : POLICY.replace("do not sell", "may sell"))));
    expect((await checkTarget(env, "r1", target, deps)).status).toBe("ok_first");
    expect((await checkTarget(env, "r2", target, deps)).status).toBe("ok_unchanged");
    const r3 = await checkTarget(env, "r3", target, deps);
    expect(r3.status).toBe("ok_changed");
    const ch = env.raw.prepare("SELECT * FROM changes").get();
    expect(ch).toMatchObject({ tool_slug: "example.com", lines_added: 1, lines_removed: 1 });
    expect(await (await env.SNAPSHOTS.get(ch.diff_r2_key)).text()).toContain("+We collect account data. We may sell it.");
    for (let i = 0; i < 12; i++) {
      deps.fetch.mockImplementation(async (url: string) => (url.endsWith("robots.txt") ? res("", { status: 404 }) : res(POLICY.replace("account data", `account data v${i}`))));
      deps.now = () => new Date(Date.UTC(2026, 10, 12 + i, 2));
      await checkTarget(env, `r${i + 4}`, target, deps);
    }
    expect(env.raw.prepare("SELECT COUNT(*) n FROM snapshots").get().n).toBe(10);
    expect([...env.SNAPSHOTS.store.keys()].filter((k: string) => k.startsWith("snapshots/")).length).toBe(10);
  });
  it("runAll: <= 6 hosts in flight, sequential within a host with a 3 s gap", async () => {
    for (let i = 0; i < 9; i++) env.raw.prepare("INSERT INTO watch_targets (tool_slug, policy_url, pinned_host) VALUES (?, ?, ?)").run(`h${i}.example`, `https://h${i}.example/p`, `h${i}.example`);
    env.raw.prepare("INSERT INTO watch_targets (tool_slug, policy_url, pinned_host) VALUES ('h0.example', 'https://h0.example/terms', 'h0.example')").run();
    let inFlight = 0, maxInFlight = 0;
    const perHost = new Map<string, number>();
    deps.fetch.mockImplementation(async (url: string) => {
      const h = new URL(url).hostname;
      perHost.set(h, (perHost.get(h) ?? 0) + 1);
      expect(perHost.get(h)).toBe(1);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--; perHost.set(h, perHost.get(h)! - 1);
      return url.endsWith("robots.txt") ? res("", { status: 404 }) : res(POLICY, { finalUrl: url });
    });
    const results = await runAll(env, "run-x", deps);
    expect(results).toHaveLength(10);
    expect(maxInFlight).toBeLessThanOrEqual(6);
    expect(deps.sleep).toHaveBeenCalledWith(3000);
    expect(await env.SNAPSHOTS.get(`reports/2026-11-11/changed-tools.md`)).not.toBeNull();
  });
});

describe("F2 and isolation", () => {
  it("no LLM calls, no email, no verdict or tools-table writes", () => {
    expect(MAX_LLM_CALLS_PER_RUN).toBe(0);
    const src = ["watch.ts", "index.ts", "normalise.ts", "robots.ts"].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n");
    const code = src.replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/anthropic|openai|extractFacts|extraction|send_email|UPDATE tools|INSERT INTO tools|compliance_status/i);
    expect(code).not.toMatch(/\.send\(|env\.EMAIL|env\.AI\b|\.forward\(/);
    const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(cfg).not.toMatch(/send_email|"ai"|policypeek-db|triggers/);
  });
});
