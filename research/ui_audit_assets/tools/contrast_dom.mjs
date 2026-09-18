import { chromium } from "playwright-core";
const base = "http://127.0.0.1:4399";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const pages = { compliant: "/tools/claude.com/", caveats: "/tools/openai.com/", not_compliant: "/tools/deepl.com/", unrated: "/tools/stability.ai/", unrated_nosummary: "/tools/zoom.com/", shared: "/tools/microsoft.com/", not_ai: "/tools/hancocyber.com/" };
let worst = { ratio: 99 }; const fails = [];
for (const scheme of ["light", "dark"]) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, colorScheme: scheme });
  for (const [name, path] of Object.entries(pages)) {
    const p = await ctx.newPage(); await p.goto(base + path);
    const res = await p.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); const v = m[1].split(/[ ,\/]+/).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (el) => { let e = el; let acc = null; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c.a > 0) { if (c.a === 1) return c; } e = e.parentElement; } return { r: 255, g: 255, b: 255, a: 1 }; };
      const out = [];
      const sel = ".v-word, .v-sub, .v-meaning, .why-t, .why-k, h2.k, span.k, .facts dt, .facts dd, .back, .domain, h1, .sources a";
      for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el); const fg = parse(cs.color); const bg = bgOf(el);
        const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
        const large = px >= 24 || (px >= 18.66 && bold);
        out.push({ cls: el.className || el.tagName, ratio: +ratio.toFixed(2), need: large ? 3 : 4.5, txt: el.textContent.trim().slice(0, 24) });
      }
      return out;
    });
    for (const r of res) { if (r.ratio < worst.ratio) worst = { ...r, scheme, name }; if (r.ratio < r.need) fails.push({ scheme, name, ...r }); }
    await p.close();
  }
  await ctx.close();
}
console.log("lowest ratio found:", JSON.stringify(worst)); console.log("failures vs AA (4.5 normal / 3 large):", JSON.stringify(fails));
await b.close();
