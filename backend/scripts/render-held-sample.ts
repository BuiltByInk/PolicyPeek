// Local-only (run with `npx tsx`; tsx is not a dependency): renders the held alert + digest from JSON dumps of read-only
// D1 SELECTs (wrangler d1 execute --json). Sends nothing, writes only to the
// output paths given. Usage: npx tsx scripts/render-held-sample.ts <dumpdir> <outdir>
import { readFileSync, writeFileSync } from "node:fs";
import { buildHeldItems, renderDigest, renderHeldAlert, summarise } from "../src/heldDetail";

const [dir, out] = process.argv.slice(2);
const load = (f: string) => JSON.parse(readFileSync(`${dir}/${f}.json`, "utf8"))[0].results;
const held = load("held");
const raw = new Map(load("raw").map((r: { id: number; raw_fetch: string }) => [r.id, r.raw_fetch]));
const rows = held.map((r: { id: number }) => ({ ...r, raw_fetch: raw.get(r.id) ?? null }));
const items = buildHeldItems(rows, load("tools"), { contacts: load("oc"), sends: load("os"), replies: load("or") });

const today = items.filter((i) => i.checked_at.startsWith("2026-11-18"));
const alerts = today.map((i) => renderHeldAlert(i, true));
writeFileSync(`${out}/held-alert-sample-2026-11-18.txt`, alerts.map((a) => a.text).join("\n\n----- next alert -----\n\n") + "\n");
writeFileSync(`${out}/held-alert-sample-2026-11-18.html`, alerts.map((a) => a.html).join("\n<hr>\n"));
const d = renderDigest(items, true);
writeFileSync(`${out}/digest-sample-2026-11-18.txt`, (d?.text ?? "(digest skipped: nothing needs Elliot)") + "\n");
writeFileSync(`${out}/digest-sample-2026-11-18.html`, d?.html ?? "");
const s = summarise(items);
console.log(JSON.stringify(s));
for (const g of ["reply", "badge_change", "new_tool", "policy_changed", "none"]) {
  console.log(`\n# ${g}`);
  for (const i of items.filter((x) => x.group === g)) console.log(`#${i.check_id} ${i.domain} ${i.noise ?? ""} cur=${i.current_verdict} prop=${i.proposed_verdict} :: ${i.why_held.slice(0, 90)}`);
}
