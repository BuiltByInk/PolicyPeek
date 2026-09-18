import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox","--allow-file-access-from-files"] });
const p = await (await b.newContext()).newPage();
const _unused = (`<style>
@font-face{font-family:BC;font-weight:800;src:url(file:///home/jumpspot/policypeek/frontend/public/fonts/barlow-condensed-latin-800-normal.woff2)}
@font-face{font-family:BC;font-weight:700;src:url(file:///home/jumpspot/policypeek/frontend/public/fonts/barlow-condensed-latin-700-normal.woff2)}
</style>`);
await p.goto("file:///home/jumpspot/policypeek/research/ui_audit_assets/tools/metrics.html");
await p.evaluate(async () => { await document.fonts.load("800 100px BC"); await document.fonts.load("700 100px BC"); });
const res = await p.evaluate(() => {
  const ctx = document.getElementById("c").getContext("2d");
  const samples = ["Does it train on your data?", "ChatGPT", "Microsoft Copilot", "What we've found so far", "NOT COMPLIANT", "DATA PRACTICES DISCLOSURE", "Compliant with caveats", "Zoom AI Companion"];
  const out = {};
  for (const [name, font] of [["BC800","800 100px BC"],["BC700","700 100px BC"],["ArialBold","700 100px Arial"],["Arial800","800 100px Arial"],["ArialNarrowBold","700 100px 'Arial Narrow'"]]) {
    ctx.font = font; let tot = 0; for (const s of samples) tot += ctx.measureText(s).width;
    const m = ctx.measureText("Hx");
    out[name] = { totalWidth: Math.round(tot), asc: m.fontBoundingBoxAscent, desc: m.fontBoundingBoxDescent, capAsc: ctx.measureText("H").actualBoundingBoxAscent.toFixed(1) };
  }
  return out;
});
console.log(res);
await b.close();
