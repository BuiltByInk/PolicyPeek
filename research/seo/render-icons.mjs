// One-off: renders og-image.png (1200x630) and favicon PNGs from the sources
// in this folder / frontend/public. Uses the headless Chromium and
// playwright-core the UI audit already installed:  node research/seo/render-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
// playwright-core lives in the UI audit tools folder's node_modules (may move), not in this folder.
const { chromium } = createRequire(join(here, "../ui_audit_assets/tools/"))("playwright-core");
const pub = join(here, "../../frontend/public");
const browser = await chromium.launch({
  executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto("file://" + join(here, "og-image.html"));
await page.screenshot({ path: join(pub, "og-image.png") });
const svg = readFileSync(join(pub, "favicon.svg"), "utf8");
for (const [size, name] of [[48, "favicon-48.png"], [180, "apple-touch-icon.png"]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
  await p.screenshot({ path: join(pub, name) });
}
await browser.close();
