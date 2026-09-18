import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399"; const out = "/home/jumpspot/policypeek/research/ui_audit_assets/shots";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
for (const scheme of ["light","dark"]) for (const w of [375, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme }); const p = await ctx.newPage();
  await p.goto(base + "/tools/?v=shared_domain_unverified"); 
  await p.screenshot({ path: `${out}/optA3-${scheme}-${w}-tools-shared.png`, clip: { x: 0, y: 100, width: w, height: Math.min(1100, 900) } });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(scheme, w, "overflow:", ov, "rows:", await p.evaluate(() => [...document.querySelectorAll("li.row")].filter(r => !r.hidden).map(r => r.dataset.domain).join(",")));
  await ctx.close();
}
await b.close();
