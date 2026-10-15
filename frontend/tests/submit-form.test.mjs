// Headless-browser test of the website's submit form (SubmitTool.astro), added
// 2026-10-09 for the submit-flow reliability pass. Builds the site with a fake
// API address, then drives the real built /tools/ page in Chromium with every
// API response mocked, and checks what the visitor is told in each case.
//
// Run:  NODE_PATH="$(npm root -g)" npm test       (from frontend/)
//
// It needs Playwright, which is NOT a dependency of this project: it uses a
// globally installed copy (found through NODE_PATH) and skips itself when
// there isn't one, so `npm test` never fails just because Playwright is absent.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium = null;
try {
  ({ chromium } = require("playwright"));
} catch {
  try {
    ({ chromium } = require("playwright-core"));
  } catch {
    /* skipped below */
  }
}
const skip = chromium ? false : "Playwright not found (set NODE_PATH to a directory that has it)";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const SITE = "http://site.test";
const API = "http://api.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".xml": "application/xml" };

let outDir;
let browser;

before(async () => {
  if (skip) return;
  outDir = mkdtempSync(join(tmpdir(), "pp-submit-test-"));
  execFileSync("npx", ["astro", "build", "--outDir", outDir], {
    cwd: FRONTEND,
    env: { ...process.env, PUBLIC_API_BASE_URL: API },
    stdio: "pipe",
  });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

// Opens /tools/ with the built site served from disk and the API answered by
// `api(request)`, which returns { status, json } or null to abort (network error).
// Records every API request so a test can check what was sent.
async function openForm(api) {
  const page = await browser.newPage();
  const calls = [];
  await page.route(`${SITE}/**`, (route) => {
    let path = decodeURIComponent(new URL(route.request().url()).pathname);
    let file = join(outDir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? "application/octet-stream", body: readFileSync(file) });
  });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-api-key" } });
    }
    const call = { method: req.method(), url: req.url(), body: req.postData() ? JSON.parse(req.postData()) : null };
    calls.push(call);
    const answer = await api(call, calls);
    if (!answer) return route.abort("connectionrefused");
    return route.fulfill({ status: answer.status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(answer.json) });
  });
  await page.goto(`${SITE}/tools/`);
  return { page, calls };
}

async function submit(page, domain, source) {
  await page.fill("#f-domain", domain);
  await page.fill("#f-source", source);
  await page.click("#submit-form button");
}

async function statusText(page, contains, timeout = 15_000) {
  await page.waitForFunction((s) => document.getElementById("submit-status")?.textContent?.includes(s), contains, { timeout });
  return page.textContent("#submit-status");
}

const accepted = (domain, is_recheck = false) => ({ status: 202, json: { pending_check_id: 1, domain, status: "pending", is_recheck, sourced_from_archive: false } });

test("an invalid website name is caught in the page, nothing is sent", { skip }, async () => {
  const { page, calls } = await openForm(() => null);
  await submit(page, "not a website", "example.com/privacy");
  await statusText(page, "doesn't look like a website name");
  assert.equal(await page.getAttribute("#f-domain", "aria-invalid"), "true");
  assert.equal(calls.length, 0);
  await page.close();
});

test("valid new domain with a subdomain policy link: sent cleaned, then shows the verdict once lookup has it", { skip }, async () => {
  const { page, calls } = await openForm((call) => {
    if (call.method === "POST") return accepted("midjourney.com");
    return { status: 200, json: { domain: "midjourney.com", matched_domain: "midjourney.com", compliance_status: "not_compliant" } };
  });
  await submit(page, "https://www.Midjourney.com/home?x=1", "docs.midjourney.com/hc/en-us/articles/privacy");
  const text = await statusText(page, "is published");
  assert.match(text, /midjourney\.com is published: Trains on your data, no opt-out/);
  assert.deepEqual(calls[0].body, { domain: "midjourney.com", source_url: "https://docs.midjourney.com/hc/en-us/articles/privacy" });
  assert.match(calls[1].url, /\/v1\/lookup\?domain=midjourney\.com$/);
  await page.close();
});

test("a parent domain's verdict from lookup is not taken as the submitted tool's", { skip }, async () => {
  const { page } = await openForm((call) => {
    if (call.method === "POST") return accepted("chat.acme.com");
    return { status: 200, json: { domain: "chat.acme.com", matched_domain: "acme.com", compliance_status: "compliant" } };
  });
  await submit(page, "chat.acme.com", "chat.acme.com/privacy");
  await statusText(page, "Checking chat.acme.com now");
  await page.waitForTimeout(4_000); // past the first poll
  assert.doesNotMatch(await page.textContent("#submit-status"), /is published/);
  await page.close();
});

test("a policy link on the API's approved other domain (bolt.new -> stackblitz.com) is sent, not refused in the page", { skip }, async () => {
  const { page, calls } = await openForm((call) => (call.method === "POST" ? accepted("bolt.new", true) : null));
  await submit(page, "bolt.new", "https://stackblitz.com/privacy-policy");
  await statusText(page, "already in the catalog");
  assert.equal(calls[0].body.source_url, "https://stackblitz.com/privacy-policy");
  await page.close();
});

test("a policy link on an unrelated domain gets the API's mismatch answer, naming both hosts", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 400, json: { error: "source_url_domain_mismatch" } }));
  await submit(page, "acme.com", "evil-acme.com/privacy");
  const text = await statusText(page, "has to be on acme.com");
  assert.match(text, /This one is on evil-acme\.com/);
  assert.equal(await page.getAttribute("#f-source", "aria-invalid"), "true");
  await page.close();
});

test("invalid domain from the API (e.g. a public suffix)", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 400, json: { error: "invalid_domain" } }));
  await submit(page, "github.io", "someone.github.io/privacy");
  await statusText(page, "doesn't look like a website name");
  await page.close();
});

test("SSRF-blocked link", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 400, json: { error: "blocked_url", reason: "blocked_target_resolved_ip" } }));
  await submit(page, "acme.com", "intranet.acme.com/privacy");
  await statusText(page, "We can't open that link");
  await page.close();
});

test("our DNS safety lookup failing is reported as a hiccup to retry, not a bad link", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 400, json: { error: "blocked_url", reason: "dns_resolution_failed" } }));
  await submit(page, "acme.com", "acme.com/privacy");
  const text = await statusText(page, "couldn't look up that website just now");
  assert.doesNotMatch(text, /can't open that link/);
  await page.close();
});

test("fetch failure", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 502, json: { error: "fetch_failed", reason: "fetch_failed_500" } }));
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "couldn't open that policy page");
  await page.close();
});

test("a page with no readable text gets its own explanation", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 502, json: { error: "fetch_failed", reason: "no_readable_text" } }));
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "no text we could read");
  await page.close();
});

test("duplicate of a tool already in the catalog is reported as a re-check", { skip }, async () => {
  const { page, calls } = await openForm(() => accepted("acme.com", true));
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "already in the catalog");
  assert.equal(calls.length, 1); // no polling for a re-check
  await page.close();
});

test("a new tool already waiting for review: says so, says the daily check wasn't used, no polling", { skip }, async () => {
  const { page, calls } = await openForm(() => ({ status: 202, json: { pending_check_id: 7, domain: "goodtool.io", status: "already_queued", already_queued: true, is_recheck: false } }));
  await submit(page, "goodtool.io", "goodtool.io/privacy");
  const text = await statusText(page, "already been submitted and is waiting for review");
  assert.match(text, /daily check wasn't used/);
  await page.waitForTimeout(3_500); // past when the first poll would have gone out
  assert.equal(calls.length, 1);
  await page.close();
});

test("a subdomain site with its policy on the parent site is sent as typed (the API decides)", { skip }, async () => {
  const { page, calls } = await openForm((call) => (call.method === "POST" ? accepted("app.acme.com") : { status: 404, json: { error: "not_found" } }));
  await submit(page, "app.acme.com", "acme.com/privacy");
  await statusText(page, "Checking app.acme.com now");
  assert.deepEqual(calls[0].body, { domain: "app.acme.com", source_url: "https://acme.com/privacy" });
  await page.close();
});

test("rate limit: own daily check used, with the reset time", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 429, json: { error: "daily_check_limit_reached", resets_at: "2030-01-02T00:00:00.000Z" } }));
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "You've used your free check for today. You can check another tool after");
  await page.close();
});

test("rate limit: service-wide ceiling says it isn't the visitor's fault", { skip }, async () => {
  const { page } = await openForm(() => ({ status: 429, json: { error: "daily_capacity_reached", resets_at: "2030-01-02T00:00:00.000Z" } }));
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "your own daily check is unused");
  await page.close();
});

test("API unreachable", { skip }, async () => {
  const { page } = await openForm(() => null);
  await submit(page, "acme.com", "acme.com/privacy");
  await statusText(page, "couldn't reach the checking service");
  assert.equal(await page.isDisabled("#submit-form button"), false);
  await page.close();
});

test("a very slow API: after 90 seconds the visitor is told not to resubmit", { skip }, async () => {
  const { page: p } = await openForm(() => new Promise(() => {})); // never answers
  await p.clock.install();
  await p.reload();
  await submit(p, "acme.com", "acme.com/privacy");
  await statusText(p, "Checking the policy page");
  await p.clock.runFor(89_000);
  assert.match(await p.textContent("#submit-status"), /Checking the policy page/);
  await p.clock.runFor(2_000);
  await statusText(p, "Please don't submit it again yet");
  await p.close();
});
