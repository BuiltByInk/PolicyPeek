// One command for "the database has new/changed tools; get them onto the
// site". Replaces the manual sequence that caused the hancocyber.com mix-up
// (generate -> forget to copy over tools.json -> build the OLD data -> deploy).
//
//   node scripts/refresh-site.mjs            # pull from D1, show diff, confirm, build, verify. Does NOT deploy.
//   node scripts/refresh-site.mjs --deploy   # same, then (after a second confirm) deploys to Pages
//   node scripts/refresh-site.mjs --yes      # skip the "apply this diff?" prompt (never skips the deploy prompt)
//
// What it does, in order:
//   1. Runs generate-tools-json.mjs (a read-only SELECT against the live D1)
//      into frontend/data/tools.generated.json.
//   2. Diffs that against frontend/data/tools.json and prints what was added,
//      removed, or changed. Exits if nothing differs.
//   3. Asks before touching anything. On yes: backs tools.json up to
//      backups/, replaces it, runs `npm run build`.
//   4. Verifies the build against the new data: a page per tool, description +
//      og:image on each, noindex on exactly the not_ai_tool pages, and those
//      pages absent from the sitemap. If the build or any check fails,
//      tools.json is restored from the backup and nothing is deployed.
//   5. Deploy only with --deploy, and only after its own confirm.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = join(REPO, "frontend");
const CURRENT = join(FRONTEND, "data/tools.json");
const GENERATED = join(FRONTEND, "data/tools.generated.json");
const DIST = join(FRONTEND, "dist");
const args = process.argv.slice(2);
const DEPLOY = args.includes("--deploy");
const YES = args.includes("--yes");

const rl = createInterface({ input: process.stdin, output: process.stdout });
async function confirm(q) {
  const a = (await rl.question(`${q} [y/N] `)).trim().toLowerCase();
  return a === "y" || a === "yes";
}
function run(cmd, cmdArgs, cwd) {
  return spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" }).status === 0;
}
function bail(msg, code = 1) {
  console.error(`\n${msg}`);
  rl.close();
  process.exit(code);
}

// 1. Pull from D1.
console.log("Pulling published tools from the live D1 (read-only SELECT)...\n");
if (!run("node", [join(REPO, "scripts/generate-tools-json.mjs")], REPO)) bail("generate-tools-json.mjs failed. Nothing changed.");

// 2. Diff.
const cur = JSON.parse(readFileSync(CURRENT, "utf8"));
const gen = JSON.parse(readFileSync(GENERATED, "utf8"));
const byDomain = (list) => new Map(list.map((t) => [t.domain, t]));
const curMap = byDomain(cur);
const genMap = byDomain(gen);
const added = gen.filter((t) => !curMap.has(t.domain));
const removed = cur.filter((t) => !genMap.has(t.domain));
const changed = gen.filter((t) => curMap.has(t.domain) && JSON.stringify(t) !== JSON.stringify(curMap.get(t.domain)));

console.log(`\nSite data now: ${cur.length} tools. Database: ${gen.length} tools.`);
for (const t of added) console.log(`  + added    ${t.domain}  (${t.compliance_status})`);
for (const t of removed) console.log(`  - REMOVED  ${t.domain}  (${curMap.get(t.domain).compliance_status})  <-- check this is intended`);
for (const t of changed) {
  const old = curMap.get(t.domain);
  const fields = Object.keys(t).filter((k) => JSON.stringify(t[k]) !== JSON.stringify(old[k]));
  const status = old.compliance_status !== t.compliance_status ? `  status ${old.compliance_status} -> ${t.compliance_status}` : "";
  console.log(`  ~ changed  ${t.domain}  [${fields.join(", ")}]${status}`);
}
if (!added.length && !removed.length && !changed.length) {
  bail("No differences. The site data already matches the database, nothing to do.", 0);
}

// 3. Confirm, back up, replace, build.
if (!YES && !(await confirm("\nApply this to frontend/data/tools.json and rebuild?"))) bail("Cancelled. tools.json untouched.", 0);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backup = join(REPO, `backups/tools.json.pre-refresh-${stamp}`);
copyFileSync(CURRENT, backup);
copyFileSync(GENERATED, CURRENT);
console.log(`\nBacked up old file to ${backup}\nBuilding...\n`);

function restore(why) {
  copyFileSync(backup, CURRENT);
  bail(`${why}\ntools.json restored from the backup. Nothing was deployed.`);
}
if (!run("npm", ["run", "build"], FRONTEND)) restore("Build failed.");

// 4. Verify the build against the new data.
const problems = [];
const sitemap = existsSync(join(DIST, "sitemap-0.xml")) ? readFileSync(join(DIST, "sitemap-0.xml"), "utf8") : "";
for (const t of gen) {
  const file = join(DIST, "tools", t.domain, "index.html");
  if (!existsSync(file)) {
    problems.push(`no page built for ${t.domain}`);
    continue;
  }
  const head = readFileSync(file, "utf8").split("</head>")[0];
  const notAi = t.compliance_status === "not_ai_tool";
  if (!/<meta name="description" content="[^"]{20,}"/.test(head)) problems.push(`${t.domain}: missing/short meta description`);
  if (!head.includes('property="og:image"')) problems.push(`${t.domain}: missing og:image`);
  if (notAi && !head.includes('name="robots" content="noindex')) problems.push(`${t.domain}: not_ai_tool but not noindex`);
  if (!notAi && head.includes('name="robots" content="noindex')) problems.push(`${t.domain}: noindex on an indexable tool`);
  const inSitemap = sitemap.includes(`/tools/${t.domain}/`);
  if (notAi && inSitemap) problems.push(`${t.domain}: noindex page is in the sitemap`);
  if (!notAi && !inSitemap) problems.push(`${t.domain}: missing from the sitemap`);
}
if (problems.length) restore(`Build finished but verification failed:\n  - ${problems.join("\n  - ")}`);
console.log(`\nVerified: ${gen.length} tool pages, descriptions, og:image, noindex/sitemap rules all consistent.`);

// 5. Deploy (opt-in).
const deployCmd = "npx wrangler pages deploy dist --project-name=policypeek-frontend";
if (!DEPLOY) {
  console.log(`\nBuilt and verified, NOT deployed. To publish:\n  cd ${FRONTEND} && ${deployCmd}`);
  bail("", 0);
}
if (!(await confirm("\nDeploy to the live site now?"))) bail("Not deployed. The build in frontend/dist is ready when you are.", 0);
if (!run("npx", ["wrangler", "pages", "deploy", "dist", "--project-name=policypeek-frontend"], FRONTEND)) bail("Deploy command failed.");
console.log("\nDeployed. Load a changed page on the live site to confirm.");
rl.close();
