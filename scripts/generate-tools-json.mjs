// Regenerates frontend/data/tools.json from real D1 -- D1 is the source
// of truth (see DECISIONS_NEEDED.md, Phase 2.5g). Mechanical propagation
// only: reads every published tools row, converts D1's storage shapes
// (0/1 integers, a JSON-string source_urls column) into the plain
// booleans/arrays tools.json already uses, and writes them out sorted the
// same way the existing file is (case-insensitive by name -- confirmed by
// inspecting the current file's order: "Stability AI" < "v0" < "Windsurf"
// only holds case-insensitively).
//
// Run from the repo root: node scripts/generate-tools-json.mjs [outputPath]
// Defaults to writing frontend/data/tools.generated.json so the caller can
// diff before replacing the real file -- this script never overwrites
// tools.json directly.

import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = process.argv[2] ?? join(REPO, "frontend/data/tools.generated.json");

const raw = execSync(
  `npx wrangler d1 execute policypeek-db --remote --json --command "SELECT name, domain, compliance_status, summary, data_retention, trains_on_user_data, gdpr_mentioned, source_urls, verified, shared_domain FROM tools;"`,
  { cwd: join(REPO, "backend"), encoding: "utf8", maxBuffer: 10_000_000 }
);
const rows = JSON.parse(raw)[0].results;

function toBool01(v) {
  return v === null ? null : Boolean(v);
}

const tools = rows
  .map((r) => ({
    name: r.name,
    domain: r.domain,
    compliance_status: r.compliance_status,
    summary: r.summary,
    data_retention: r.data_retention,
    trains_on_user_data: toBool01(r.trains_on_user_data),
    gdpr_mentioned: toBool01(r.gdpr_mentioned),
    source_urls: JSON.parse(r.source_urls),
    verified: toBool01(r.verified),
    shared_domain: toBool01(r.shared_domain),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

// The existing tools.json escapes every non-ASCII character (em-dashes,
// curly quotes) as a \uXXXX sequence rather than writing raw UTF-8 bytes --
// matches an ensure_ascii=True-style JSON writer, not JS's JSON.stringify
// default. Replicate that character-by-character so a diff against the
// current file doesn't show spurious raw-vs-escaped noise on every entry
// that happens to use one of those characters.
function escapeNonAscii(jsonString) {
  let out = "";
  for (let i = 0; i < jsonString.length; i++) {
    const code = jsonString.charCodeAt(i);
    out += code > 126 ? "\\u" + code.toString(16).padStart(4, "0") : jsonString[i];
  }
  return out;
}

writeFileSync(outputPath, escapeNonAscii(JSON.stringify(tools, null, 2)) + "\n");
console.log(`Wrote ${tools.length} tools to ${outputPath}`);
