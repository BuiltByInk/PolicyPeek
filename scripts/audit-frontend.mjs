// Frontend npm audit with exactly one time-limited waiver. Frontend only; the
// backend audit in predeploy-check.mjs is unchanged.
//
//   node scripts/audit-frontend.mjs      (runs `npm audit --json` in frontend/)
//
// Same strictness as plain `npm audit`: any advisory of any severity fails, all
// dependencies (dev included), except the one waiver below.
//
// WAIVER (Security, 18 Nov 2026): GHSA-fc5q-39xc-vjpf, picomatch ReDoS through
// single-branch repeated extglobs. No patched picomatch exists yet, and npm's
// only suggested fix is a breaking astro 5.3.0 downgrade, which we do not apply.
// REMOVE THIS WAIVER as soon as a patched picomatch is released (update the
// lockfile instead). It expires on its own: from 2 Dec 2026 (00:00 UTC) it no
// longer applies and the audit fails again.
//
// The waiver covers the advisory itself on picomatch, plus the named packages
// npm flags only because they depend on picomatch (their `via` chain must lead
// back to this advisory and nothing else). Any other advisory, any other
// package, or a known package that picks up a different advisory, still fails.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const WAIVER = Object.freeze({
  ghsa: "GHSA-fc5q-39xc-vjpf",
  advisoryPackage: "picomatch",
  // Packages npm marks vulnerable solely via picomatch, as seen 18 Nov 2026.
  chainPackages: Object.freeze([
    "@astrojs/internal-helpers",
    "@astrojs/markdown-satteri",
    "@astrojs/vite-plugin-astro",
    "anymatch",
    "astro",
    "fdir",
    "tinyglobby",
    "unstorage",
    "vite",
  ]),
  expires: "2026-12-02T00:00:00Z", // waiver applies only strictly before this instant
});

const isWaivedAdvisory = (via, pkg) =>
  typeof via === "object" && via !== null &&
  pkg === WAIVER.advisoryPackage && via.name === WAIVER.advisoryPackage &&
  typeof via.url === "string" && via.url.endsWith(`/${WAIVER.ghsa}`);

// Returns { ok, waived: [names], failures: [{ name, severity, reason }] }.
export function evaluateAudit(report, now = new Date()) {
  const vulns = (report && report.vulnerabilities) || {};
  const waiverActive = now.getTime() < Date.parse(WAIVER.expires);
  const memo = new Map();
  const covered = (name, stack = new Set()) => {
    if (memo.has(name)) return memo.get(name);
    if (stack.has(name)) return false;
    stack.add(name);
    const v = vulns[name];
    let ok = false;
    if (v && waiverActive && (name === WAIVER.advisoryPackage || WAIVER.chainPackages.includes(name))) {
      const via = Array.isArray(v.via) ? v.via : [];
      ok = via.length > 0 && via.every((x) =>
        typeof x === "string" ? covered(x, stack) : isWaivedAdvisory(x, name));
    }
    stack.delete(name);
    memo.set(name, ok);
    return ok;
  };
  const failures = [];
  const waived = [];
  for (const [name, v] of Object.entries(vulns)) {
    if (covered(name)) { waived.push(name); continue; }
    const advisories = (v.via || []).filter((x) => typeof x === "object").map((x) => x.url || x.title).filter(Boolean);
    const reason = !waiverActive && (name === WAIVER.advisoryPackage || WAIVER.chainPackages.includes(name))
      ? `waiver ${WAIVER.ghsa} expired ${WAIVER.expires}`
      : advisories.length ? advisories.join(", ") : `via ${(v.via || []).join(", ")}`;
    failures.push({ name, severity: v.severity, reason });
  }
  return { ok: failures.length === 0, waived, failures };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
  const r = spawnSync("npm", ["audit", "--json"], { cwd: join(REPO, "frontend"), encoding: "utf8", timeout: 120_000 });
  let report;
  try { report = JSON.parse(r.stdout); } catch { report = null; }
  if (!report || report.error) {
    const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network|audit endpoint returned an error/i.test(text)) {
      console.log("WARN registry unreachable; not checked");
      process.exit(2);
    }
    console.log(`FAIL could not read npm audit output: ${text.trim().split("\n").slice(-2).join(" | ").slice(0, 200)}`);
    process.exit(1);
  }
  const res = evaluateAudit(report);
  if (res.waived.length) console.log(`waived until ${WAIVER.expires} (${WAIVER.ghsa}): ${res.waived.join(", ")}`);
  for (const f of res.failures) console.log(`FAIL ${f.name} (${f.severity}): ${f.reason}`);
  console.log(res.ok ? "PASS frontend audit" : `FAIL ${res.failures.length} unwaived finding(s)`);
  process.exit(res.ok ? 0 : 1);
}
