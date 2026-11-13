#!/usr/bin/env node
// IndexNow ping (Bing, Yandex, Seznam, Naver...). Submits changed page URLs
// plus the canonical sitemap URLs (sitemap-index.xml and sitemap.xml — not
// the Astro chunk sitemap-0.xml) to https://api.indexnow.org/indexnow.
//
// Called automatically, fire-and-forget, after a successful production
// Pages deploy: from refresh-site.mjs --deploy, and from the
// indexnow-after-deploy GitHub Action on pushes to main. Still safe to run
// by hand. Never called from the frontend build or from tests without
// --dry-run or an injected fetch (tests must not hit the real endpoint).
//
//   node scripts/indexnow-ping.mjs --dry-run      # show what would be sent; sends nothing
//   node scripts/indexnow-ping.mjs                # send new/changed URLs since the last send
//   node scripts/indexnow-ping.mjs --all          # send every sitemap page URL plus the sitemap itself
//
// Options:
//   --dist <dir>        built site to read (default: frontend/dist, i.e. what was just deployed)
//   --sitemap <url>     read a live sitemap instead of the local build (then only <lastmod> is compared)
//   --state <file>      where the last-sent fingerprints live (default: scripts/.indexnow-state.json, gitignored)
//   --fail-open         log a failure and exit 0 (used after deploy so a ping error cannot fail the deploy)
//
// "Changed" = a URL that isn't in the state file, or whose fingerprint differs.
// The fingerprint is a SHA-256 of the built HTML when the page is in --dist,
// else the sitemap <lastmod>. No state file (first run) means every URL.
// The state file is written only after IndexNow answers 200 or 202, never on --dry-run.
//
// The key file (frontend/public/<32 hex>.txt) is public by design: IndexNow
// fetches https://getpolicypeek.com/<key>.txt to check we own the host. It is
// not a secret and needs no environment variable.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HOST = "getpolicypeek.com";
export const ENDPOINT = "https://api.indexnow.org/indexnow";
// Canonical sitemap URLs we want Bing to read. Astro still emits sitemap-0.xml
// as a child of the index; we do not submit that child as the sitemap.
export const SITEMAP_PING_URLS = [
  `https://${HOST}/sitemap-index.xml`,
  `https://${HOST}/sitemap.xml`,
];
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BATCH = 10000; // IndexNow's per-request limit

/** Page URLs plus the canonical sitemap URLs, de-duplicated, pages first. */
export function urlsWithSitemap(pageUrls) {
  const out = [];
  const seen = new Set();
  for (const u of [...pageUrls, ...SITEMAP_PING_URLS]) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function findKey(publicDir = join(ROOT, "frontend/public")) {
  const files = readdirSync(publicDir).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (files.length !== 1) throw new Error(`expected exactly one IndexNow key file in ${publicDir}, found ${files.length}`);
  const key = files[0].slice(0, 32);
  if (readFileSync(join(publicDir, files[0]), "utf8").trim() !== key) throw new Error(`${files[0]} must contain its own key`);
  return { key, keyLocation: `https://${HOST}/${files[0]}` };
}

/** [{ loc, lastmod }] from a sitemap or sitemap index body. */
export function parseSitemap(xml) {
  return [...xml.matchAll(/<(?:url|sitemap)>([\s\S]*?)<\/(?:url|sitemap)>/g)].map((m) => ({
    loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim(),
    lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null,
  })).filter((e) => e.loc);
}

/** Read every page URL from a sitemap index (local file path or http URL). */
export async function readSitemapUrls(start, { dist, fetchImpl = fetch } = {}) {
  const get = async (where) => {
    if (/^https?:/.test(where)) {
      if (dist) { // map a production URL onto the local build
        const p = join(dist, new URL(where).pathname);
        if (existsSync(p)) return readFileSync(p, "utf8");
      }
      const r = await fetchImpl(where);
      if (!r.ok) throw new Error(`${where}: HTTP ${r.status}`);
      return r.text();
    }
    return readFileSync(where, "utf8");
  };
  const out = [];
  for (const e of parseSitemap(await get(start))) {
    if (e.loc.endsWith(".xml")) out.push(...parseSitemap(await get(e.loc)));
    else out.push(e);
  }
  const seen = new Set();
  return out.filter((e) => { try { if (new URL(e.loc).host !== HOST || seen.has(e.loc)) return false; } catch { return false; } seen.add(e.loc); return true; });
}

/** Fingerprint per URL: hash of the built page if we have it, else lastmod. */
export function fingerprints(entries, dist) {
  const fp = {};
  for (const e of entries) {
    const path = new URL(e.loc).pathname;
    const file = dist ? join(dist, path.endsWith("/") ? `${path}index.html` : path) : null;
    fp[e.loc] = file && existsSync(file)
      ? "sha256:" + createHash("sha256").update(readFileSync(file)).digest("hex")
      : `lastmod:${e.lastmod ?? ""}`;
  }
  return fp;
}

/** URLs that are new or whose fingerprint changed. null previous = first run = all. */
export function changedUrls(current, previous) {
  if (!previous) return Object.keys(current);
  return Object.keys(current).filter((u) => previous[u] !== current[u]);
}

export function buildPayloads(urlList, { key, keyLocation }) {
  const out = [];
  for (let i = 0; i < urlList.length; i += BATCH) out.push({ host: HOST, key, keyLocation, urlList: urlList.slice(i, i + BATCH) });
  return out;
}

export function parseArgs(argv) {
  const a = { dryRun: false, all: false, failOpen: false, waitLive: false, since: null, dist: join(ROOT, "frontend/dist"), sitemap: null, state: join(ROOT, "scripts/.indexnow-state.json") };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry-run") a.dryRun = true;
    else if (k === "--all") a.all = true;
    else if (k === "--fail-open") a.failOpen = true;
    else if (k === "--wait-live") a.waitLive = true;
    else if (k === "--since") a.since = argv[++i];
    else if (k === "--dist") a.dist = argv[++i];
    else if (k === "--sitemap") a.sitemap = argv[++i];
    else if (k === "--state") a.state = argv[++i];
    else if (k === "-h" || k === "--help") a.help = true;
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

/**
 * Build the IndexNow payload list for a run. Does not fetch the endpoint.
 * `fetchSitemap` is only used when --sitemap points at a remote URL.
 */
export async function planIndexNow(args, { fetchSitemap } = {}) {
  const keyInfo = findKey();
  const useDist = !args.sitemap;
  if (useDist && !existsSync(join(args.dist, "sitemap-index.xml"))) throw new Error(`no ${join(args.dist, "sitemap-index.xml")}: build the site first (cd frontend && npm run build), or pass --sitemap <url>`);
  const entries = await readSitemapUrls(useDist ? join(args.dist, "sitemap-index.xml") : args.sitemap, { dist: useDist ? args.dist : null, fetchImpl: fetchSitemap });
  const current = fingerprints(entries, useDist ? args.dist : null);
  const previous = !args.all && existsSync(args.state) ? JSON.parse(readFileSync(args.state, "utf8")) : null;
  const pages = args.all ? Object.keys(current) : changedUrls(current, previous);
  const why = args.all ? "--all" : previous ? "new or changed since the last send" : "first run (no state file), so every URL";
  const urlList = pages.length ? urlsWithSitemap(pages) : [];
  return { keyInfo, entries, current, previous, pages, why, urlList, payloads: buildPayloads(urlList, keyInfo) };
}

/** Send planned payloads. `fetchImpl` must be injected in tests. Returns { ok, status }. */
export async function sendIndexNow(payloads, { dryRun = false, state, previous, current, fetchImpl, log = console } = {}) {
  if (dryRun) {
    log.log(`DRY RUN: nothing sent to ${ENDPOINT}; state file not written.`);
    for (const p of payloads) log.log(JSON.stringify(p, null, 2));
    return { ok: true, dryRun: true, sent: 0 };
  }
  if (!payloads.length || !payloads.some((p) => p.urlList.length)) {
    log.log("Nothing to send.");
    return { ok: true, sent: 0 };
  }
  if (typeof fetchImpl !== "function") throw new Error("fetchImpl is required to send (tests must inject a mock; the CLI provides fetch)");
  let sent = 0;
  for (const body of payloads) {
    const res = await fetchImpl(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    log.log(`IndexNow: HTTP ${res.status} ${res.statusText} for ${body.urlList.length} URLs`);
    const text = (await res.text()).slice(0, 300);
    if (text) log.log(text);
    if (res.status !== 200 && res.status !== 202) {
      log.error("Not saving state: IndexNow did not accept the batch. Re-run after fixing.");
      return { ok: false, status: res.status, sent };
    }
    sent += body.urlList.length;
  }
  if (state) {
    writeFileSync(state, JSON.stringify({ ...(previous ?? {}), ...current }, null, 1) + "\n");
    log.log(`State saved to ${state}.`);
  }
  return { ok: true, sent };
}

export async function waitForLiveSitemap({ since, timeoutMs = 8 * 60 * 1000, intervalMs = 15_000, fetchImpl = fetch, log = console } = {}) {
  const url = SITEMAP_PING_URLS[0];
  const deadline = Date.now() + timeoutMs;
  const sinceMs = since ? Date.parse(since) : NaN;
  while (true) {
    try {
      const res = await fetchImpl(url, { cache: "no-store" });
      const text = await res.text();
      const lastmod = text.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      const lastMs = lastmod ? Date.parse(lastmod) : NaN;
      const ready = res.ok && Number.isFinite(lastMs) && (!Number.isFinite(sinceMs) || lastMs >= sinceMs - 60_000);
      if (ready) { log.log(`Live sitemap lastmod ${lastmod}`); return true; }
      log.log(`Waiting for sitemap lastmod >= ${since ?? "any"} (saw ${lastmod ?? res.status})`);
    } catch (e) {
      log.log(`Waiting for live sitemap: ${e.message}`);
    }
    if (Date.now() >= deadline) { log.log("Timed out waiting for live sitemap; will ping anyway."); return false; }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function runIndexNow(args, { fetchImpl, log = console } = {}) {
  const plan = await planIndexNow(args, { fetchSitemap: fetchImpl });
  log.log(`IndexNow: ${plan.pages.length} of ${plan.entries.length} page URLs to send (${plan.why})${plan.urlList.length ? `; plus ${SITEMAP_PING_URLS.join(" and ")}` : ""}.`);
  return sendIndexNow(plan.payloads, { dryRun: args.dryRun, state: args.state, previous: plan.previous, current: plan.current, fetchImpl, log });
}

/** After a production Pages deploy. Never throws when failOpen is true (the default). */
export async function pingAfterDeploy({ dist, sitemap = null, state, fetchImpl, log = console, failOpen = true } = {}) {
  try {
    const result = await runIndexNow({
      dryRun: false,
      all: false,
      dist: dist ?? join(ROOT, "frontend/dist"),
      sitemap,
      state: state ?? join(ROOT, "scripts/.indexnow-state.json"),
    }, { fetchImpl: fetchImpl ?? fetch, log });
    if (!result.ok && !failOpen) throw new Error(`IndexNow HTTP ${result.status ?? "error"}`);
    if (!result.ok) log.error("IndexNow ping failed; deploy is unaffected.");
    return result;
  } catch (e) {
    log.error(`IndexNow ping failed (deploy still succeeded): ${e.message}`);
    if (!failOpen) throw e;
    return { ok: false, error: e.message, sent: 0 };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 24).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  try {
    if (args.waitLive) await waitForLiveSitemap({ since: args.since, fetchImpl: fetch });
    const result = await runIndexNow(args, { fetchImpl: fetch });
    if (!result.ok && !args.failOpen) process.exitCode = 1;
  } catch (e) {
    console.error(`indexnow-ping: ${e.message}`);
    if (!args.failOpen) process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
