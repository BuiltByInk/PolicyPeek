import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const reqs = [], warns = [];
await ctx.route("**/*", (r) => { const u = r.request().url(); if (!u.startsWith(base)) { reqs.push("NON-LOCAL " + u); return r.abort(); } return r.continue(); });
const p = await ctx.newPage();
p.on("console", (m) => { if (["warning","error"].includes(m.type())) warns.push(m.type() + ": " + m.text()); });
p.on("requestfinished", async (r) => { if (r.url().includes("/fonts/")) { const resp = await r.response(); reqs.push(`${resp.status()} ${r.url().replace(base,"")} ${(await r.sizes()).responseBodySize}B cached=${resp.fromServiceWorker()}`); } });
for (const path of ["/tools/hancocyber.com/", "/", "/tools/"]) {
  await p.goto(base + path, { waitUntil: "networkidle" });
  const info = await p.evaluate(async () => {
    await document.fonts.ready;
    return { loaded: [...document.fonts].filter(f => f.status === "loaded").map(f => f.family + " " + f.weight), h1: getComputedStyle(document.querySelector("h1")).fontFamily.slice(0, 60), h1w: getComputedStyle(document.querySelector("h1")).fontWeight };
  });
  console.log(path, JSON.stringify(info));
}
console.log(reqs.join("\n")); console.log("console warnings/errors:", JSON.stringify(warns));
await b.close();
