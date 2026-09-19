// One command to run before any deploy. Local only: it never touches Cloudflare,
// D1 or any PolicyPeek endpoint. Exit code 1 if anything fails.
//
//   node scripts/predeploy-check.mjs
//
// Checks: backend tests + type-check, frontend build, npm audit (both packages),
// secret-looking strings in tracked files, that env/secret files are not tracked,
// and a warning if tracked SQL dumps contain client IPs. Run it, then follow
// DEPLOY_RUNBOOK_*.md. Dashboard-only settings (rate-limit rules, Anthropic spend
// limit, ADMIN_TOKEN strength) can't be checked from here; the runbook lists them.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function run(name, cmd, args, cwd, { warnOnly = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: 300_000 });
  const ok = r.status === 0;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ");
  results.push({ name, status: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail: ok ? "" : out.slice(0, 200) });
}

run("backend tests", "npx", ["vitest", "run"], join(REPO, "backend"));
run("backend type-check", "npx", ["tsc", "--noEmit", "--noUnusedLocals", "--noUnusedParameters", "-p", "."], join(REPO, "backend"));
run("frontend build", "npm", ["run", "build"], join(REPO, "frontend"));
// npm audit needs the registry; a network failure is a warning, a real advisory is a failure.
for (const dir of ["backend", "frontend"]) {
  const r = spawnSync("npm", ["audit", ...(dir === "backend" ? ["--omit=dev"] : [])], { cwd: join(REPO, dir), encoding: "utf8", timeout: 120_000 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status === 0) results.push({ name: `npm audit (${dir})`, status: "PASS", detail: "" });
  else if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network|audit endpoint returned an error/i.test(text)) results.push({ name: `npm audit (${dir})`, status: "WARN", detail: "registry unreachable; not checked" });
  else results.push({ name: `npm audit (${dir})`, status: "FAIL", detail: text.trim().split("\n").slice(-2).join(" | ").slice(0, 200) });
}

const tracked = spawnSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).stdout.split("\n").filter(Boolean);

const forbidden = tracked.filter((f) => /(^|\/)(\.env|\.dev\.vars)$/.test(f) || /\.(pem|key)$/.test(f));
results.push({ name: "no env/secret files tracked", status: forbidden.length ? "FAIL" : "PASS", detail: forbidden.join(", ") });

const patterns = [/sk-ant-[A-Za-z0-9_-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b\d{6,}:[A-Za-z0-9_-]{30,}\b/ /* Telegram bot token shape */];
const hits = [];
for (const f of tracked) {
  if (/\.(png|ico|woff2?|jpg|jpeg|gif|lock)$/.test(f) || f === "frontend/package-lock.json") continue;
  let text;
  try { text = readFileSync(join(REPO, f), "utf8"); } catch { continue; }
  if (patterns.some((p) => p.test(text))) hits.push(f);
}
results.push({ name: "no secret-looking strings in tracked files", status: hits.length ? "FAIL" : "PASS", detail: hits.join(", ") });

const dumpsWithIps = tracked.filter((f) => f.endsWith(".sql") && (() => {
  try { return /anonymous_check_log/.test(readFileSync(join(REPO, f), "utf8")) && /INSERT INTO[^\n]*anonymous_check_log[^\n]*\d+\.\d+\.\d+\.\d+/.test(readFileSync(join(REPO, f), "utf8")); } catch { return false; }
})());
results.push({ name: "no client IPs in tracked SQL dumps", status: dumpsWithIps.length ? "WARN" : "PASS", detail: dumpsWithIps.join(", ") });

const dirty = spawnSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8" }).stdout.trim();
results.push({ name: "git working tree clean", status: dirty ? "WARN" : "PASS", detail: dirty ? `${dirty.split("\n").length} changed path(s)` : "" });

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(width)}  ${r.detail}`);
const failed = results.filter((r) => r.status === "FAIL").length;
console.log(failed ? `\n${failed} check(s) failed. Do not deploy yet.` : "\nNo failures. Warnings, if any, are worth a look before deploying.");
process.exit(failed ? 1 : 0);
