// Writes frontend/data/first-published.json: for each tool domain, the date
// (YYYY-MM-DD, UTC) of the first commit on this branch's first-parent history
// (i.e. main, once merged) whose frontend/data/tools.json contains it. Used as
// the tool page's JSON-LD `datePublished` (D1, best-answer plan 18 Nov 2026).
//
// Local and read-only apart from that one file; never touches D1 or Cloudflare.
// Re-run after a catalog PR lands on main:  node scripts/first-published.mjs
// A tool missing from the file simply gets no datePublished (never a guess).
// Existing dates are never moved later, so re-running is stable.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "frontend/data/tools.json";
const OUT = join(REPO, "frontend/data/first-published.json");
const git = (...a) => execFileSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 });

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out = { ...prev };
const commits = git("rev-list", "--first-parent", "--reverse", "--format=%H %cI", "HEAD", "--", FILE)
  .split("\n").filter((l) => /^[0-9a-f]{40} /.test(l));
for (const line of commits) {
  const [sha, iso] = line.split(" ");
  let tools;
  try { tools = JSON.parse(git("show", `${sha}:${FILE}`)); } catch { continue; }
  const day = new Date(iso).toISOString().slice(0, 10);
  for (const t of Array.isArray(tools) ? tools : []) if (t?.domain && !(t.domain in out)) out[t.domain] = day;
  for (const [d, v] of Object.entries(prev)) if (out[d] > v) out[d] = v;
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
console.log(`first-published.json: ${Object.keys(sorted).length} domains`);
