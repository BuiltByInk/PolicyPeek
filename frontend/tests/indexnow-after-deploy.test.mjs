// IndexNow post-deploy ping: fire-and-forget, sitemap URLs included, no real HTTP.
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ENDPOINT, SITEMAP_PING_URLS, urlsWithSitemap, pingAfterDeploy, sendIndexNow, buildPayloads, findKey, waitForLiveSitemap,
} from "../../scripts/indexnow-ping.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = join(REPO, "frontend/dist");

function mockFetch(status, { body = "", calls } = {}) {
  return async (url, init) => {
    calls.push({ url, method: init?.method, body: init?.body });
    return { status, statusText: status === 200 ? "OK" : "Error", text: async () => body };
  };
}

test("urlsWithSitemap adds the canonical sitemap URLs and not sitemap-0.xml", () => {
  const pages = ["https://getpolicypeek.com/tools/openai.com/"];
  const out = urlsWithSitemap(pages);
  assert.deepEqual(out, [
    "https://getpolicypeek.com/tools/openai.com/",
    "https://getpolicypeek.com/sitemap-index.xml",
    "https://getpolicypeek.com/sitemap.xml",
  ]);
  assert.deepEqual(SITEMAP_PING_URLS, [
    "https://getpolicypeek.com/sitemap-index.xml",
    "https://getpolicypeek.com/sitemap.xml",
  ]);
  assert.ok(!out.includes("https://getpolicypeek.com/sitemap-0.xml"));
});

test("pingAfterDeploy posts changed cards plus sitemaps to IndexNow, and writes state only on 200", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pp-indexnow-send-"));
  const state = join(tmp, "state.json");
  const calls = [];
  const logs = [];
  const log = { log: (s) => logs.push(String(s)), error: (s) => logs.push(String(s)) };
  const result = await pingAfterDeploy({
    dist, state, failOpen: true, fetchImpl: mockFetch(200, { calls }), log,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(calls[0].method, "POST");
  const payload = JSON.parse(calls[0].body);
  assert.ok(payload.urlList.includes("https://getpolicypeek.com/sitemap-index.xml"));
  assert.ok(payload.urlList.includes("https://getpolicypeek.com/sitemap.xml"));
  assert.ok(payload.urlList.some((u) => u.includes("/tools/openai.com/")));
  assert.ok(!payload.urlList.includes("https://getpolicypeek.com/sitemap-0.xml"));
  assert.ok(payload.urlList.length > 2);
  assert.equal(existsSync(state), true);
});

test("pingAfterDeploy is fire-and-forget: a 500 does not throw, and state is not written", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "pp-indexnow-fail-"));
  const state = join(tmp, "state.json");
  const calls = [];
  const logs = [];
  const log = { log: (s) => logs.push(String(s)), error: (s) => logs.push(String(s)) };
  const result = await pingAfterDeploy({
    dist, state, failOpen: true, fetchImpl: mockFetch(500, { body: "nope", calls }), log,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 500);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENDPOINT);
  assert.equal(existsSync(state), false);
  assert.ok(logs.some((l) => /did not accept|unaffected|failed/i.test(l)));
});

test("pingAfterDeploy failOpen swallows a thrown fetch and never reaches a real host", async () => {
  const calls = [];
  const log = { log: () => {}, error: () => {} };
  const result = await pingAfterDeploy({
    dist,
    state: join(mkdtempSync(join(tmpdir(), "pp-indexnow-throw-")), "state.json"),
    failOpen: true,
    fetchImpl: async (url) => { calls.push(url); throw new Error("network down"); },
    log,
  });
  assert.equal(result.ok, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], ENDPOINT);
});

test("sendIndexNow dry-run never calls fetchImpl", async () => {
  const { key, keyLocation } = findKey();
  let called = false;
  const payloads = buildPayloads(urlsWithSitemap(["https://getpolicypeek.com/tools/openai.com/"]), { key, keyLocation });
  const result = await sendIndexNow(payloads, {
    dryRun: true,
    fetchImpl: async () => { called = true; throw new Error("should not be called"); },
    log: { log: () => {}, error: () => {} },
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(called, false);
});

test("waitForLiveSitemap is ready when lastmod is at or after --since", async () => {
  const xml = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://getpolicypeek.com/sitemap-0.xml</loc><lastmod>2026-11-13T12:00:00.000Z</lastmod></sitemap></sitemapindex>';
  const calls = [];
  const ready = await waitForLiveSitemap({
    since: "2026-11-13T11:59:00.000Z",
    timeoutMs: 1000,
    intervalMs: 10,
    fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => xml }; },
    log: { log: () => {}, error: () => {} },
  });
  assert.equal(ready, true);
  assert.equal(calls[0], "https://getpolicypeek.com/sitemap-index.xml");
});
