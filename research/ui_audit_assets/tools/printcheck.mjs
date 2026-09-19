import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const p = await (await b.newContext({ viewport: { width: 900, height: 900 } })).newPage();
for (const [n, u] of [["unrated", "/tools/zoom.com/"], ["caveats", "/tools/openai.com/"]]) {
  await p.goto("http://127.0.0.1:4399" + u); await p.emulateMedia({ media: "print" });
  await p.screenshot({ path: `/home/jumpspot/policypeek/research/ui_audit_assets/shots/optA-print-${n}.png`, fullPage: true });
}
await b.close();
