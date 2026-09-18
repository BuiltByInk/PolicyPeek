import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
async function measure(w, path, block, fam) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  if (block) await ctx.route("**/fonts/**", (r) => r.abort());
  const p = await ctx.newPage(); await p.goto(base + path, { waitUntil: "load" }); await p.evaluate(() => document.fonts.ready);
  const h = await p.evaluate(() => ({ page: document.documentElement.scrollHeight, h1: document.querySelector("h1").getBoundingClientRect().height, h1w: document.querySelector("h1").scrollWidth }));
  await ctx.close(); return h;
}
for (const w of [375, 1280]) for (const path of ["/", "/tools/", "/tools/openai.com/", "/tools/microsoft.com/", "/tools/zoom.com/", "/tools/hancocyber.com/", "/about/"]) {
  const a = await measure(w, path, false), f = await measure(w, path, true);
  console.log(`${w} ${path.padEnd(22)} loaded page=${a.page} h1=${a.h1.toFixed(0)} | fallback page=${f.page} h1=${f.h1.toFixed(0)} | page shift=${f.page - a.page}px`);
}
await b.close();
