import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox","--allow-file-access-from-files"] });
for (const scheme of ["light","dark"]) {
  const p = await (await b.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: scheme })).newPage();
  await p.goto("file:///home/jumpspot/policypeek/research/ui_mocks/tool_page_options.html");
  await p.waitForTimeout(400);
  await p.screenshot({ path: `/home/jumpspot/policypeek/research/ui_audit_assets/shots/mock-${scheme}.png`, fullPage: true });
}
await b.close();
