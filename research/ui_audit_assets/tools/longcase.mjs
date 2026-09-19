import { chromium } from "playwright-core"; import fs from "node:fs"; import path from "node:path";
const root = "/home/jumpspot/policypeek/research/ui_audit_assets/xss_fixture/dist"; const origin = "http://fixture.test";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const types = { ".html": "text/html", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".css": "text/css", ".txt": "text/plain" };
for (const scheme of ["light", "dark"]) for (const w of [375, 768, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  await ctx.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== origin) return r.abort();
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "nf" });
    return r.fulfill({ status: 200, contentType: types[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  for (const [n, pth] of [["long", "/tools/a-very-long-subdomain-name-that-keeps-going.internationalized-example-company-name.co.uk/"], ["shared-empty", "/tools/x.io/"], ["list", "/tools/"]]) {
    const p = await ctx.newPage(); await p.goto(origin + pth); await p.evaluate(() => document.fonts.ready);
    const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(scheme, w, n, ov.sw > ov.cw ? "OVERFLOW " + JSON.stringify(ov) : "ok");
    if (w === 375 && (scheme === "light" || n === "long")) await p.screenshot({ path: `/home/jumpspot/policypeek/research/ui_audit_assets/shots/optA-longcase-${scheme}-${w}-${n}.png`, fullPage: true });
    await p.close();
  }
  await ctx.close();
}
await b.close();
