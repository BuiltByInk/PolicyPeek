#!/usr/bin/env node
// IndexNow ping (Bing, Yandex, Seznam, Naver...). Run BY HAND after
// `wrangler pages deploy` -- never wired into the build or deploy itself.
//
//   node scripts/indexnow-ping.mjs --dry-run      # show what would be sent; sends nothing
//   node scripts/indexnow-ping.mjs                # send new/changed URLs since the last send
//   node scripts/indexnow-ping.mjs --all          # send every sitemap URL
//
// Options:
//   --dist <dir>        built site to read (default: frontend/dist, i.e. what was just deployed)
//   --sitemap <url>     read a live sitemap instead of the local build (then only <lastmod> is compared)
//   --state <file>      where the last-sent fingerprints live (default: scripts/.indexnow-state.json, gitignored)
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
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BATCH = 10000; // IndexNow's per-request limit

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
export async function readSitemapUrls(start, { dist } = {}) {
  const get = async (where) => {
    if (/^https?:/.test(where)) {
      if (dist) { // map a production URL onto the local build
        const p = join(dist, new URL(where).pathname);
        if (existsSync(p)) return readFileSync(p, "utf8");
      }
      const r = await fetch(where);
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
  const a = { dryRun: false, all: false, dist: join(ROOT, "frontend/dist"), sitemap: null, state: join(ROOT, "scripts/.indexnow-state.json") };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry-run") a.dryRun = true;
    else if (k === "--all") a.all = true;
    else if (k === "--dist") a.dist = argv[++i];
    else if (k === "--sitemap") a.sitemap = argv[++i];
    else if (k === "--state") a.state = argv[++i];
    else if (k === "-h" || k === "--help") a.help = true;
    else throw new Error(`unknown option ${k}`);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); return; }
  const keyInfo = findKey();
  const useDist = !args.sitemap;
  if (useDist && !existsSync(join(args.dist, "sitemap-index.xml"))) throw new Error(`no ${join(args.dist, "sitemap-index.xml")}: build the site first (cd frontend && npm run build), or pass --sitemap <url>`);
  const entries = await readSitemapUrls(useDist ? join(args.dist, "sitemap-index.xml") : args.sitemap, { dist: useDist ? args.dist : null });
  const current = fingerprints(entries, useDist ? args.dist : null);
  const previous = !args.all && existsSync(args.state) ? JSON.parse(readFileSync(args.state, "utf8")) : null;
  const urls = args.all ? Object.keys(current) : changedUrls(current, previous);
  const why = args.all ? "--all" : previous ? "new or changed since the last send" : "first run (no state file), so every URL";
  console.log(`IndexNow: ${urls.length} of ${entries.length} sitemap URLs to send (${why}).`);
  const payloads = buildPayloads(urls, keyInfo);
  if (args.dryRun) {
    console.log(`DRY RUN: nothing sent to ${ENDPOINT}; state file not written.`);
    for (const p of payloads) console.log(JSON.stringify(p, null, 2));
    return;
  }
  if (!urls.length) { console.log("Nothing to send."); return; }
  for (const body of payloads) {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    console.log(`IndexNow: HTTP ${res.status} ${res.statusText} for ${body.urlList.length} URLs`);
    const text = (await res.text()).slice(0, 300);
    if (text) console.log(text);
    if (res.status !== 200 && res.status !== 202) { console.error("Not saving state: IndexNow did not accept the batch. Re-run after fixing."); process.exitCode = 1; return; }
  }
  writeFileSync(args.state, JSON.stringify({ ...(previous ?? {}), ...current }, null, 1) + "\n");
  console.log(`State saved to ${args.state}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`indexnow-ping: ${e.message}`); process.exit(1); });
}
