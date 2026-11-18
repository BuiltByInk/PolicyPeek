// F1 seed: reads a READ-ONLY export of policypeek-db (SELECT domain, name,
// compliance_status, source_urls FROM tools) and writes SQL for the watcher DB.
// Usage: node --experimental-strip-types policy-watcher/scripts/seed-watch-targets.ts <tools.json> <out.sql>
import { readFileSync, writeFileSync } from "node:fs";

const [, , inFile, outFile] = process.argv;
const dump = JSON.parse(readFileSync(inFile, "utf8"));
const tools: { domain: string; source_urls: string | null }[] = Array.isArray(dump) ? dump[0].results : dump.results;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lines = ["-- Generated from a read-only policypeek-db export. Never written back."];
let n = 0, skipped = 0;
for (const t of tools) {
  let urls: string[] = [];
  try { urls = JSON.parse(t.source_urls ?? "[]"); } catch { urls = []; }
  for (const u of urls) {
    let url: URL;
    try { url = new URL(u); } catch { skipped++; continue; }
    if (url.protocol !== "https:") { skipped++; continue; }
    lines.push(`INSERT OR IGNORE INTO watch_targets (tool_slug, policy_url, pinned_host) VALUES (${q(t.domain)}, ${q(u)}, ${q(url.hostname.toLowerCase())});`);
    n++;
  }
}
writeFileSync(outFile, lines.join("\n") + "\n");
console.log(JSON.stringify({ tools: tools.length, targets: n, skipped_non_https: skipped }));
