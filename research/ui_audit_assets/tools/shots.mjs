import { chromium } from "playwright-core";
const base = process.env.BASE || "http://127.0.0.1:4399";
const out = process.env.OUT || "shots";
const tag = process.env.TAG || "before";
const exe = "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const pages = {
  home: "/", tools: "/tools/", about: "/about/",
  compliant: "/tools/claude.com/", caveats: "/tools/openai.com/", notcompliant: "/tools/deepl.com/",
  unrated: "/tools/stability.ai/", shared: "/tools/microsoft.com/", notai: "/tools/hancocyber.com/",
  zoom: "/tools/zoom.com/", amazon: "/tools/amazon.com/",
};
const widths = [375, 768, 1280];
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const report = [];
for (const scheme of ["light", "dark"]) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    // Never allow anything but the local preview server.
    await ctx.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith(base) || u.startsWith("data:")) return route.continue();
      report.push("BLOCKED " + u); return route.abort();
    });
    for (const [name, p] of Object.entries(pages)) {
      const page = await ctx.newPage();
      await page.goto(base + p);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        over: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.tagName + "." + e.className + ":" + Math.round(e.getBoundingClientRect().right)).slice(0,6)
      }));
      report.push(`${scheme} ${w} ${name}: scrollW=${m.sw} clientW=${m.cw} ${m.sw>m.cw?"OVERFLOW":""} ${m.over.join(" | ")}`);
      await page.screenshot({ path: `${out}/${tag}-${scheme}-${w}-${name}.png`, fullPage: true });
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
console.log(report.join("\n"));
