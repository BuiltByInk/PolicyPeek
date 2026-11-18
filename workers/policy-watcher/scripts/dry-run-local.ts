// Manual watcher dry run on the box: real https fetches through the backend's
// safeFetch, local in-memory D1, snapshots written to a local folder. No cloud
// resources, no email, no LLM.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeDb, makeR2 } from "../../test-utils/d1shim";
import { runAll } from "../src/watch";

const [, , migFile, seedSql, outDir] = process.argv;
const db = makeDb(migFile);
db.raw.exec(readFileSync(seedSql, "utf8"));
const r2 = makeR2();
(async () => {
  const runId = `run-local-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const t0 = Date.now();
  const results = await runAll({ DB: db.d1, SNAPSHOTS: r2 }, runId);
  for (const [k, v] of r2.store) { const p = join(outDir, k); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, v.body); }
  writeFileSync(join(outDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ runId, seconds: Math.round((Date.now() - t0) / 1000), n: results.length }));
})();
