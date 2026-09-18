import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const exe = "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const log = (...a) => console.log(...a);
const blocked = [];
async function mk(scheme = "light", w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  ctx.__api = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.startsWith("https://api.getpolicypeek.com")) { ctx.__api.push(route.request().method() + " " + u); return ctx.__handler ? ctx.__handler(route) : route.abort(); }
    blocked.push(u); return route.abort();
  });
  return ctx;
}
// 1. main padding + link colors + focus order
{
  const ctx = await mk("light"); const p = await ctx.newPage(); await p.goto(base + "/");
  log("main computed padding:", await p.evaluate(() => { const s = getComputedStyle(document.querySelector("main")); return s.paddingTop + " / " + s.paddingBottom; }));
  log("link color (body a):", await p.evaluate(() => getComputedStyle(document.querySelector(".how a")).color), "underline:", await p.evaluate(() => getComputedStyle(document.querySelector(".how a")).textDecorationLine));
  log("placeholder color light:", await p.evaluate(() => getComputedStyle(document.querySelector("input[name=domain]"), "::placeholder").color));
  const order = [];
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press("Tab");
    order.push(await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${e.tagName}${e.className ? "." + e.className : ""}[${(e.textContent || e.name || "").trim().slice(0, 22)}] outline=${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`; }));
  }
  log("home tab order:\n  " + order.join("\n  "));
  await ctx.close();
}
// dark placeholder + default link colour
{
  const ctx = await mk("dark"); const p = await ctx.newPage(); await p.goto(base + "/");
  log("dark placeholder:", await p.evaluate(() => getComputedStyle(document.querySelector("input[name=domain]"), "::placeholder").color));
  log("dark link color:", await p.evaluate(() => getComputedStyle(document.querySelector(".how a")).color));
  await ctx.close();
}
// 2. SubmitTool with mocked API
const cases = [
  ["202 new", { status: 202, body: { pending_check_id: 1, domain: "example.com", status: "pending", is_recheck: false } }, "example.com", "https://example.com/privacy"],
  ["202 recheck", { status: 202, body: { is_recheck: true } }, "example.com", "https://example.com/privacy"],
  ["429 limit", { status: 429, body: { error: "daily_check_limit_reached", resets_at: "2026-09-19T09:30:00.000Z" } }, "example.com", "https://example.com/privacy"],
  ["400 invalid_domain (user typed https://…)", { status: 400, body: { error: "invalid_domain" } }, "https://example.com", "https://example.com/privacy"],
  ["400 mismatch", { status: 400, body: { error: "source_url_domain_mismatch" } }, "example.com", "https://other.com/privacy"],
  ["400 blocked_url", { status: 400, body: { error: "blocked_url" } }, "example.com", "https://example.com/privacy"],
  ["502 fetch_failed", { status: 502, body: { error: "fetch_failed" } }, "example.com", "https://example.com/privacy"],
  ["500 html body", { status: 500, raw: "<html>Bad gateway</html>", ct: "text/html" }, "example.com", "https://example.com/privacy"],
  ["network abort", { abort: true }, "example.com", "https://example.com/privacy"],
];
for (const [name, spec, dom, src] of cases) {
  const ctx = await mk("light"); const p = await ctx.newPage();
  ctx.__handler = (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" } });
    if (spec.abort) return route.abort();
    return route.fulfill({ status: spec.status, contentType: spec.ct || "application/json", headers: { "access-control-allow-origin": "*" }, body: spec.raw ?? JSON.stringify(spec.body) });
  };
  await p.goto(base + "/tools/");
  await p.fill("input[name=domain]", dom);
  // source_url is type=url: bypass native validation only when we want to test server path; report native validity
  await p.fill("input[name=source_url]", src);
  const nativeValid = await p.evaluate(() => document.getElementById("submit-form").checkValidity());
  await p.click("button[type=submit]");
  await p.waitForTimeout(400);
  const text = await p.textContent("#submit-status");
  const vals = await p.evaluate(() => [document.querySelector("input[name=domain]").value, document.querySelector("input[name=source_url]").value]);
  log(`[${name}] nativeValid=${nativeValid} -> "${text}" | fields after: ${JSON.stringify(vals)} | api calls: ${ctx.__api.filter(x=>x.startsWith("POST")).length}`);
  await ctx.close();
}
// native validation for bare policy link
{
  const ctx = await mk("light"); const p = await ctx.newPage(); await p.goto(base + "/tools/");
  await p.fill("input[name=domain]", "example.com"); await p.fill("input[name=source_url]", "example.com/privacy");
  log("bare policy link 'example.com/privacy' native msg:", await p.evaluate(() => document.querySelector("input[name=source_url]").validationMessage));
  log("client-side POSTs attempted:", ctx.__api.filter(x=>x.startsWith("POST")).length);
  await ctx.close();
}
// 3. 404
{
  const ctx = await mk("light"); const p = await ctx.newPage();
  const r = await p.goto(base + "/tools/does-not-exist/");
  log("unknown tool status:", r.status(), "| body:", (await p.textContent("body")).trim().slice(0, 120).replace(/\s+/g, " "));
  await ctx.close();
}
// 4. print + reduced-motion static
{
  const ctx = await mk("light"); const p = await ctx.newPage(); await p.goto(base + "/tools/openai.com/");
  await p.emulateMedia({ media: "print" }); await p.screenshot({ path: "/home/jumpspot/policypeek/research/ui_audit_assets/shots/after-print-openai.png", fullPage: true });
  await ctx.close();
}
log("BLOCKED non-local requests (aborted, never sent):", JSON.stringify(blocked));
await browser.close();
