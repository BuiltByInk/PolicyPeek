import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const shots = "/home/jumpspot/policypeek/research/ui_audit_assets/shots";
const browser = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const log = console.log; const blocked = [];
async function mk(scheme = "light", w = 1280) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  ctx.__api = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.startsWith("https://api.getpolicypeek.com")) { ctx.__api.push(route.request().method() + " " + u + " " + (route.request().postData() || "")); return ctx.__handler ? ctx.__handler(route) : route.abort(); }
    blocked.push(u); return route.abort();
  });
  return ctx;
}
const errs = [];
// filter tests
{
  const ctx = await mk(); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto(base + "/tools/");
  const vis = () => p.evaluate(() => [...document.querySelectorAll("li.row")].filter((r) => !r.hidden).length);
  log("all:", await vis(), "|", await p.textContent("#count"));
  await p.fill("#q", "open"); log("q=open:", await vis(), await p.evaluate(() => [...document.querySelectorAll("li.row")].filter(r=>!r.hidden).map(r=>r.dataset.name).join(",")));
  await p.fill("#q", "<img src=x onerror=alert(1)>"); log("xss-ish query no-match shown:", await p.evaluate(() => !document.getElementById("no-match").hidden), "| echoed as text:", await p.textContent("#nm-q"), "| img elements injected:", await p.evaluate(() => document.querySelectorAll("#no-match img").length));
  await p.fill("#q", "newtool.io"); await p.click("#nm-add"); log("prefilled domain:", await p.inputValue("#f-domain"), "| focused:", await p.evaluate(() => document.activeElement.id));
  await p.click("#nm-clear").catch(()=>{}); 
  await p.goto(base + "/tools/?v=not_compliant"); log("?v=not_compliant:", await vis(), "pressed chip:", await p.evaluate(() => document.querySelector('.chip[aria-pressed=true]')?.dataset.status));
  await p.goto(base + "/tools/?v=bogus&q=%3Cb%3E"); log("bogus status ignored, q literal:", await vis(), await p.inputValue("#q"));
  await p.goto(base + "/tools/"); await p.selectOption("#sort", "verdict");
  log("verdict sort first 8:", await p.evaluate(() => [...document.querySelectorAll("li.row")].slice(0, 8).map(r => r.dataset.status).join(",")));
  await p.screenshot({ path: shots + "/after-light-1280-tools-sorted-top.png", clip: { x: 0, y: 0, width: 1280, height: 900 } });
  // keyboard: tab through controls
  await p.goto(base + "/tools/"); const order = [];
  for (let i = 0; i < 14; i++) { await p.keyboard.press("Tab"); order.push(await p.evaluate(() => { const e = document.activeElement; return `${e.tagName}:${(e.textContent || e.id || "").trim().slice(0, 18)}`; })); }
  log("tools tab order:", order.join(" > "));
  await ctx.close();
}
// mobile tools at 375, filter chip layout
{
  const ctx = await mk("light", 375); const p = await ctx.newPage(); await p.goto(base + "/tools/?v=unrated");
  await p.screenshot({ path: shots + "/after-light-375-tools-unrated.png", fullPage: true });
  log("375 overflow:", await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
  await ctx.close();
}
// home search GET form
{
  const ctx = await mk(); const p = await ctx.newPage(); await p.goto(base + "/");
  await p.fill("#home-q", "cursor"); await p.press("#home-q", "Enter"); await p.waitForURL("**/tools/?q=cursor");
  log("home search -> ", p.url(), "| rows visible:", await p.evaluate(() => [...document.querySelectorAll("li.row")].filter(r => !r.hidden).length));
  await ctx.close();
}
// submit form (mocked)
const cases = [
  ["empty", null, "", ""],
  ["https:// in domain, bare policy link (should normalise + succeed)", { status: 202, body: { is_recheck: false } }, "https://www.Example.com/pricing?x=1", "example.com/privacy"],
  ["typo domain", null, "notadomain", "example.com/privacy"],
  ["policy on other host", null, "example.com", "https://other.com/privacy"],
  ["bad link", null, "example.com", "https://"],
  ["429 with resets_at", { status: 429, body: { error: "daily_check_limit_reached", resets_at: "2026-09-19T09:30:00.000Z" } }, "example.com", "https://example.com/privacy"],
  ["429 no resets_at", { status: 429, body: { error: "daily_check_limit_reached" } }, "example.com", "https://example.com/privacy"],
  ["400 blocked_url", { status: 400, body: { error: "blocked_url" } }, "example.com", "https://example.com/privacy"],
  ["502", { status: 502, body: { error: "fetch_failed" } }, "example.com", "https://example.com/privacy"],
  ["500 html", { status: 500, raw: "<html>x</html>", ct: "text/html" }, "example.com", "https://example.com/privacy"],
  ["network abort", { abort: true }, "example.com", "https://example.com/privacy"],
  ["202 recheck", { status: 202, body: { is_recheck: true } }, "example.com", "https://example.com/privacy"],
  ["XSS-ish input echoed?", { status: 202, body: { is_recheck: false } }, "<img src=x onerror=alert(1)>.com", "https://example.com"],
];
for (const [name, spec, dom, src] of cases) {
  const ctx = await mk(); const p = await ctx.newPage();
  ctx.__handler = (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" } });
    if (!spec || spec.abort) return route.abort();
    return route.fulfill({ status: spec.status, contentType: spec.ct || "application/json", headers: { "access-control-allow-origin": "*" }, body: spec.raw ?? JSON.stringify(spec.body) });
  };
  await p.goto(base + "/tools/");
  await p.fill("#f-domain", dom); await p.fill("#f-source", src);
  await p.click("#submit-form button[type=submit]"); await p.waitForTimeout(350);
  const t = (await p.textContent("#submit-status")).trim();
  const inv = await p.evaluate(() => [...document.querySelectorAll("#submit-form input[aria-invalid=true]")].map(i => i.name).join(","));
  const posted = ctx.__api.filter(x => x.startsWith("POST"));
  log(`[${name}] "${t}" | invalid=${inv || "-"} | focus=${await p.evaluate(() => document.activeElement.id || document.activeElement.tagName)} | POST body: ${posted.map(x=>x.split(" ").slice(2).join(" ")).join(";") || "(none sent)"} | btn: ${await p.textContent("#submit-form button")}`);
  if (name.startsWith("429 with")) await p.screenshot({ path: shots + "/after-light-1280-submit-429.png", clip: { x: 0, y: 150, width: 1280, height: 500 } });
  if (name.startsWith("typo")) await p.screenshot({ path: shots + "/after-light-1280-submit-error.png", clip: { x: 0, y: 150, width: 1280, height: 500 } });
  await ctx.close();
}
log("page errors:", JSON.stringify(errs)); log("BLOCKED non-local:", JSON.stringify(blocked));
await browser.close();
