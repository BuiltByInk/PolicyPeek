// Policy watcher core (F1-F7). Fetches ONLY D1 watch_targets URLs, https only,
// honours robots.txt, paces requests per host, accepts html/plain/pdf only,
// normalises + hashes, stores the last N snapshots and capped diffs.
// It never sends email, never calls an LLM, never writes a verdict or any
// policypeek-db table. Alerts go only to the run summary / D1 / R2 report.
import { safeFetch, SsrfBlockedError, type SafeFetchOptions, type SafeFetchResult } from "../../../backend/src/ssrf";
import { normaliseHtml, normaliseText, sha256Hex, unifiedDiff } from "./normalise";
import { isAllowed } from "./robots";
import { recordHealth } from "./health";

export const USER_AGENT = "PolicyPeek-PolicyWatch/1.0 (+https://getpolicypeek.com/about; privacy@getpolicypeek.com)";
export const MAX_LLM_CALLS_PER_RUN = 0; // F2: the watcher makes no LLM calls at all.
export const MAX_CONCURRENT_HOSTS = 6;
export const PER_HOST_GAP_MS = 3_000;
export const TIMEOUT_MS = 10_000;
export const MAX_BODY_BYTES = 500_000;
export const KEEP_SNAPSHOTS = 10;
export const ROBOTS_TTL_MS = 24 * 3_600_000;
export const ACCEPTED_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "application/pdf"];

export interface WatchEnv { DB: D1Database; SNAPSHOTS: R2Bucket }
export interface Target { id: number; tool_slug: string; policy_url: string; pinned_host: string }
export interface Deps { fetch: (url: string, opts: SafeFetchOptions) => Promise<SafeFetchResult>; sleep: (ms: number) => Promise<void>; now: () => Date }
export const defaultDeps: Deps = { fetch: safeFetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => new Date() };

export type Status = "ok_unchanged" | "ok_first" | "ok_changed" | "failed" | "blocked_robots" | "flagged_redirect" | "skipped";
export interface Result { tool_slug: string; policy_url: string; status: Status; reason?: string; http_status?: number; final_host?: string; content_kind?: string; sha256?: string }

const FETCH_OPTS: SafeFetchOptions = { httpsOnly: true, userAgent: USER_AGENT, timeoutMs: TIMEOUT_MS, maxBodyBytes: MAX_BODY_BYTES };

// F1 host pin: same host, a www. variant, or a subdomain of the pinned host.
export function onPinnedHost(finalHost: string, pinned: string): boolean {
  const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
  const f = bare(finalHost), p = bare(pinned);
  return f === p || f.endsWith(`.${p}`);
}

export function contentKind(ct: string): "html" | "text" | "pdf" | null {
  const t = ct.split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(t)) return null;
  return t === "application/pdf" ? "pdf" : t === "text/plain" ? "text" : "html";
}

async function robotsFor(env: WatchEnv, host: string, deps: Deps): Promise<{ txt: string | null; fetched: boolean; unavailable?: string }> {
  const cached = await env.DB.prepare("SELECT fetched_at, status, body FROM robots_cache WHERE host = ?").bind(host).first<{ fetched_at: string; status: number; body: string }>();
  if (cached && deps.now().getTime() - Date.parse(cached.fetched_at) < ROBOTS_TTL_MS) return { txt: cached.status >= 200 && cached.status < 300 ? cached.body : "", fetched: false };
  let res: SafeFetchResult;
  try {
    res = await deps.fetch(`https://${host}/robots.txt`, { ...FETCH_OPTS, maxBodyBytes: 100_000 });
  } catch (e) {
    return { txt: null, fetched: true, unavailable: e instanceof SsrfBlockedError ? `robots_${e.message}` : "robots_fetch_error" };
  }
  if (res.status >= 500) return { txt: null, fetched: true, unavailable: `robots_http_${res.status}` };
  // 4xx => no robots file => allow all (RFC 9309). Cache 24 h either way.
  const body = res.status >= 200 && res.status < 300 ? new TextDecoder().decode(res.bytes) : "";
  await env.DB.prepare("INSERT INTO robots_cache (host, fetched_at, status, body) VALUES (?, ?, ?, ?) ON CONFLICT (host) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status, body = excluded.body").bind(host, deps.now().toISOString(), res.status, body.slice(0, 100_000)).run();
  return { txt: body, fetched: true };
}

async function record(env: WatchEnv, runId: string, r: Result, now: Date): Promise<Result> {
  await env.DB.prepare("INSERT INTO results (run_id, tool_slug, policy_url, status, reason, http_status, final_host, content_kind, sha256, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(runId, r.tool_slug, r.policy_url, r.status, r.reason ?? null, r.http_status ?? null, r.final_host ?? null, r.content_kind ?? null, r.sha256 ?? null, now.toISOString()).run();
  await recordHealth(env, r, now);
  // Logs: slug, host, status, hash prefix only. Never page text.
  console.log(JSON.stringify({ event: "watch", tool_slug: r.tool_slug, host: r.final_host ?? null, status: r.status, reason: r.reason ?? null, sha: r.sha256?.slice(0, 12) ?? null }));
  return r;
}

export async function checkTarget(env: WatchEnv, runId: string, t: Target, deps: Deps): Promise<Result> {
  const base = { tool_slug: t.tool_slug, policy_url: t.policy_url };
  const now = deps.now();
  let url: URL;
  try { url = new URL(t.policy_url); } catch { return record(env, runId, { ...base, status: "skipped", reason: "invalid_url" }, now); }
  if (url.protocol !== "https:") return record(env, runId, { ...base, status: "skipped", reason: "not_https" }, now);
  if (url.hostname.toLowerCase() !== t.pinned_host.toLowerCase()) return record(env, runId, { ...base, status: "skipped", reason: "url_not_on_pinned_host" }, now);

  const robots = await robotsFor(env, url.hostname, deps);
  if (robots.fetched) await deps.sleep(PER_HOST_GAP_MS);
  if (robots.txt === null) return record(env, runId, { ...base, status: "blocked_robots", reason: `${robots.unavailable} (treated as disallow this run)` }, now);
  if (!isAllowed(robots.txt, url.pathname + url.search)) return record(env, runId, { ...base, status: "blocked_robots", reason: "disallowed_for_our_ua" }, now);

  let res: SafeFetchResult;
  try {
    res = await deps.fetch(t.policy_url, FETCH_OPTS);
  } catch (e) {
    const reason = e instanceof SsrfBlockedError ? `ssrf_${e.message}` : (e as Error)?.name === "AbortError" ? "timeout" : "network_error";
    return record(env, runId, { ...base, status: "failed", reason }, now);
  }
  const finalHost = new URL(res.finalUrl).hostname.toLowerCase();
  if (!onPinnedHost(finalHost, t.pinned_host)) return record(env, runId, { ...base, status: "flagged_redirect", reason: `redirected off pinned host to ${finalHost}`, http_status: res.status, final_host: finalHost }, now);
  if (res.status < 200 || res.status >= 300) return record(env, runId, { ...base, status: "failed", reason: `http_${res.status}`, http_status: res.status, final_host: finalHost }, now);
  const kind = contentKind(res.contentType);
  if (!kind) return record(env, runId, { ...base, status: "failed", reason: `unsupported_content_type ${res.contentType.split(";")[0].slice(0, 60)}`, http_status: res.status, final_host: finalHost }, now);

  let normalised: string | null = null;
  let sha: string;
  if (kind === "pdf") sha = await sha256Hex(res.bytes);
  else {
    const raw = new TextDecoder().decode(res.bytes);
    normalised = kind === "html" ? normaliseHtml(raw) : normaliseText(raw);
    if (normalised.length < 200) return record(env, runId, { ...base, status: "failed", reason: "thin_content_after_normalise (likely JS-rendered)", http_status: res.status, final_host: finalHost, content_kind: kind }, now);
    sha = await sha256Hex(normalised);
  }
  const urlHash = (await sha256Hex(t.policy_url)).slice(0, 16);
  const prev = await env.DB.prepare("SELECT sha256, r2_key, content_kind FROM snapshots WHERE url_hash = ? AND tool_slug = ? ORDER BY fetched_at DESC, id DESC LIMIT 1").bind(urlHash, t.tool_slug).first<{ sha256: string; r2_key: string; content_kind: string }>();
  const extra = { http_status: res.status, final_host: finalHost, content_kind: kind, sha256: sha, truncated: res.truncated };
  if (prev && prev.sha256 === sha) return record(env, runId, { ...base, status: "ok_unchanged", http_status: res.status, final_host: finalHost, content_kind: kind, sha256: sha }, now);

  const ts = now.toISOString().replace(/[:.]/g, "-");
  const key = `snapshots/${t.tool_slug}/${urlHash}/${ts}-${sha.slice(0, 12)}.${kind === "pdf" ? "pdf" : "txt"}`;
  // Read the previous text before writing anything new.
  const oldText = prev && kind !== "pdf" && prev.content_kind !== "pdf" ? await (await env.SNAPSHOTS.get(prev.r2_key))?.text() : undefined;
  await env.SNAPSHOTS.put(key, kind === "pdf" ? res.bytes : normalised!, { customMetadata: { tool_slug: t.tool_slug, policy_url: t.policy_url, sha256: sha, truncated: String(extra.truncated) } });
  await env.DB.prepare("INSERT INTO snapshots (tool_slug, policy_url, url_hash, sha256, content_kind, r2_key, bytes, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(t.tool_slug, t.policy_url, urlHash, sha, kind, key, kind === "pdf" ? res.bytes.byteLength : normalised!.length, now.toISOString()).run();

  let status: Status = "ok_first";
  let reason: string | undefined = res.truncated ? "body_truncated_at_500KB" : undefined;
  if (prev) {
    status = "ok_changed";
    let diffKey: string | null = null, truncated = false, added = 0, removed = 0;
    if (kind !== "pdf" && prev.content_kind !== "pdf") {
      if (oldText !== undefined) {
        const d = unifiedDiff(oldText, normalised!, prev.r2_key, key);
        diffKey = `diffs/${now.toISOString().slice(0, 10)}/${t.tool_slug}-${urlHash}-${sha.slice(0, 12)}.diff`;
        await env.SNAPSHOTS.put(diffKey, d.diff);
        ({ truncated, added, removed } = d);
      }
    } else reason = "pdf changed (bytes hash only, no text diff)";
    await env.DB.prepare("INSERT INTO changes (run_id, tool_slug, policy_url, detected_at, old_sha256, new_sha256, diff_r2_key, diff_truncated, lines_added, lines_removed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(runId, t.tool_slug, t.policy_url, now.toISOString(), prev.sha256, sha, diffKey, truncated ? 1 : 0, added, removed).run();
  }
  // Keep only the latest N snapshots per URL.
  const old = (await env.DB.prepare("SELECT id, r2_key FROM snapshots WHERE url_hash = ? AND tool_slug = ? ORDER BY fetched_at DESC, id DESC LIMIT -1 OFFSET ?").bind(urlHash, t.tool_slug, KEEP_SNAPSHOTS).all<{ id: number; r2_key: string }>()).results;
  if (old.length) {
    await env.SNAPSHOTS.delete(old.map((o) => o.r2_key));
    for (const o of old) await env.DB.prepare("DELETE FROM snapshots WHERE id = ?").bind(o.id).run();
  }
  return record(env, runId, { ...base, status, reason, http_status: res.status, final_host: finalHost, content_kind: kind, sha256: sha }, now);
}

// One host's targets, strictly sequential, with a gap between requests.
export async function processHost(env: WatchEnv, runId: string, targets: Target[], deps: Deps = defaultDeps): Promise<Result[]> {
  const out: Result[] = [];
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await deps.sleep(PER_HOST_GAP_MS);
    out.push(await checkTarget(env, runId, targets[i], deps));
  }
  return out;
}

export function groupByHost(targets: Target[]): Map<string, Target[]> {
  const m = new Map<string, Target[]>();
  for (const t of targets) m.set(t.pinned_host, [...(m.get(t.pinned_host) ?? []), t]);
  return m;
}

// In-process runner (manual dry run / tests): <= 6 hosts at once.
export async function runAll(env: WatchEnv, runId: string, deps: Deps = defaultDeps): Promise<Result[]> {
  const targets = (await env.DB.prepare("SELECT id, tool_slug, policy_url, pinned_host FROM watch_targets WHERE active = 1 ORDER BY id").all<Target>()).results;
  await env.DB.prepare("INSERT OR IGNORE INTO runs (run_id, started_at, targets) VALUES (?, ?, ?)").bind(runId, deps.now().toISOString(), targets.length).run();
  const hosts = [...groupByHost(targets).values()];
  const results: Result[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const h = hosts[next++];
      results.push(...(await processHost(env, runId, h, deps)));
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_HOSTS, hosts.length) }, worker));
  await finishRun(env, runId, deps.now());
  return results;
}

export interface RunSummary { run_id: string; targets: number; counts: Record<Status, number>; alerts: string[]; changed: string[]; flagged: string[] }

export async function finishRun(env: WatchEnv, runId: string, now: Date): Promise<RunSummary> {
  await env.DB.prepare("UPDATE runs SET finished_at = ? WHERE run_id = ?").bind(now.toISOString(), runId).run();
  const rows = (await env.DB.prepare("SELECT tool_slug, policy_url, status, reason FROM results WHERE run_id = ?").bind(runId).all<{ tool_slug: string; policy_url: string; status: Status; reason: string | null }>()).results;
  const counts = { ok_unchanged: 0, ok_first: 0, ok_changed: 0, failed: 0, blocked_robots: 0, flagged_redirect: 0, skipped: 0 } as Record<Status, number>;
  for (const r of rows) counts[r.status]++;
  const alerts: string[] = [];
  if (rows.length && counts.failed / rows.length > 0.2) alerts.push(`failure spike: ${counts.failed}/${rows.length}`);
  if (counts.ok_changed > 10) alerts.push(`many changes: ${counts.ok_changed}`);
  if (counts.flagged_redirect > 0) alerts.push(`cross-host redirects: ${counts.flagged_redirect}`);
  const summary: RunSummary = { run_id: runId, targets: rows.length, counts, alerts, changed: rows.filter((r) => r.status === "ok_changed").map((r) => `${r.tool_slug} ${r.policy_url}`), flagged: rows.filter((r) => r.status === "flagged_redirect").map((r) => `${r.tool_slug} ${r.policy_url}: ${r.reason}`) };
  // Daily list for Research (R2 JSON + markdown). No email, ever.
  const day = now.toISOString().slice(0, 10);
  await env.SNAPSHOTS.put(`reports/${day}/changed-tools.json`, JSON.stringify(summary, null, 2));
  const md = [`# Policy watcher, ${day} (run ${runId})`, "", `Counts: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`, "", alerts.length ? `Alerts: ${alerts.join("; ")}` : "Alerts: none", "", "## Changed", ...(summary.changed.length ? summary.changed.map((c) => `- ${c}`) : ["- none"]), "", "## Cross-host redirects (not diffed; review)", ...(summary.flagged.length ? summary.flagged.map((c) => `- ${c}`) : ["- none"]), ""].join("\n");
  await env.SNAPSHOTS.put(`reports/${day}/changed-tools.md`, md);
  return summary;
}
