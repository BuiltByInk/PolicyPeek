import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
for (const path of ["/", "/about/", "/tools/openai.com/"]) {
  await p.goto(base + path);
  console.log(path, await p.evaluate(() => {
    const out = {};
    for (const sel of ["h1", "h2", ".lp-head", "ol li"]) { const e = document.querySelector(sel); if (e) { const s = getComputedStyle(e); out[sel] = `${s.fontFamily.slice(0, 40)} | w${s.fontWeight} | ls ${s.letterSpacing}`; } }
    return out;
  }));
}
// which fonts installed? 
console.log(await p.evaluate(() => ["Helvetica Neue Condensed","Arial Narrow","Arial","Helvetica"].map(f => f + ":" + document.fonts.check("16px \"" + f + "\""))));
await b.close();
