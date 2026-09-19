// Serves frontend/dist on localhost only and screenshots a few pages of the current build.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(join(here, "../ui_audit_assets/tools/"))("playwright-core");
const srv = spawn("python3", ["-m", "http.server", "4399", "--bind", "127.0.0.1"], { cwd: join(here, "../../frontend/dist"), stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ executablePath: "/home/jumpspot/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome", args: ["--no-sandbox"] });
const shots = [
  ["final-1280-light-zoom", "/tools/zoom.com/", 1280, "light"],
  ["final-375-light-amazon", "/tools/amazon.com/", 375, "light"],
  ["final-375-dark-cursor", "/tools/cursor.com/", 375, "dark"],
  ["final-1280-light-tools", "/tools/", 1280, "light"],
];
const outDir = join(here, "final-shots");
import { mkdirSync } from "node:fs"; mkdirSync(outDir, { recursive: true });
for (const [name, path, w, scheme] of shots) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  const external = [];
  page.on("request", (r) => { if (!r.url().startsWith("http://127.0.0.1:4399")) external.push(r.url()); });
  await page.goto("http://127.0.0.1:4399" + path, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outDir, name + ".png"), fullPage: false });
  console.log(name, "external requests:", external.length ? external : "none");
  await ctx.close();
}
await browser.close(); srv.kill();
