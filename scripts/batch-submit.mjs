// Batch-submits researched tools (research/tool_sources.json) through the
// real POST /v1/check pipeline, in small paced batches, using a paid-tier
// API key so the free-tier daily cap doesn't apply.
//
// Nothing is sent unless you pass --go. The default is a dry run that prints
// the plan (domain, source URL, whether it would be held) and touches nothing.
//
//   node scripts/batch-submit.mjs                       # dry run, whole plan
//   node scripts/batch-submit.mjs --go                  # submit next 5 pending tools
//   node scripts/batch-submit.mjs --go --limit 10       # next 10
//   node scripts/batch-submit.mjs --go --only zed,warp  # just these (can force a held tool)
//   node scripts/batch-submit.mjs --go --delay 60       # 60s between submissions (default 30)
//
// The key is read from the POLICYPEEK_API_KEY environment variable only --
// never a command-line argument, so it can't land in shell history:
//   POLICYPEEK_API_KEY="$KEY" node scripts/batch-submit.mjs --go
//
// Every submission attempt is appended to research/batch_submissions.jsonl.
// Re-running skips any tool already accepted (HTTP 202), so it's safe to stop
// and resume. Submitting does NOT publish anything: results land in the
// review queue (or auto-publish only when the pipeline is confident, exactly
// as for a normal submission). Approve/reject stays your call via the admin
// endpoints.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = join(REPO, "research/tool_sources.json");
const PUBLISHED = join(REPO, "frontend/data/tools.json");
const LOG = join(REPO, "research/batch_submissions.jsonl");
const API = process.env.POLICYPEEK_API_BASE ?? "https://api.getpolicypeek.com";

// The 26 researched-but-never-submitted tools, in the order they'll run.
// (bolt-new is intentionally absent: bolt.new is already published.)
const PLAN = [
  "zed", "warp", "fathom", "krisp", "tldv", "gamma", "recraft",
  "black-forest-labs", "superhuman", "synthesia", "speechify", "tabnine",
  "continue-dev", "wordtune", "sudowrite", "rev", "poe", "donotpay",
  "elicit", "teal", "pika", "kling-ai",
  // Held by default -- see HELD below.
  "adobe-firefly", "devin", "suno", "character-ai",
];

// Held tools are skipped unless named explicitly with --only, because each
// needs a decision or is expected to fail as things stand.
const HELD = {
  "adobe-firefly":
    "Policy lives on adobe.com, a known shared multi-product domain. It would publish as adobe.com with the 'shared_domain_unverified' verdict, not as a Firefly-specific badge. Your call whether that's wanted.",
  devin:
    "Product is devin.ai but the policy is on cognition.com, and the backend only allows that via the curated map in crossDomainSources.ts (a code change + deploy). The same policy also covers Windsurf, which is already published. Expect source_url_domain_mismatch until that's decided.",
  suno:
    "Policy URL is on suno.ai but the product and terms are on suno.com. Need to pick which domain is the tool's identity (and confirm a policy URL on that domain) before submitting.",
  "character-ai":
    "character.ai's legal pages are a client-rendered app; research only ever got the page shell. The backend fetcher likely gets the same, so expect a fetch or empty-extraction result.",
};

// Domain to register the tool under. Default: the policy URL's host without
// "www.". Overrides only where the product's identity differs from that.
const DOMAIN_OVERRIDES = {
  "adobe-firefly": "adobe.com",
  devin: "devin.ai",
  suno: "suno.ai",
};

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const GO = flag("--go");
const LIMIT = Number(opt("--limit", "5"));
const DELAY_S = Number(opt("--delay", "30"));
const ONLY = opt("--only", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const sources = JSON.parse(readFileSync(SOURCES, "utf8"));
const publishedDomains = new Set(JSON.parse(readFileSync(PUBLISHED, "utf8")).map((t) => t.domain));

const accepted = new Set();
if (existsSync(LOG)) {
  for (const line of readFileSync(LOG, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.http === 202) accepted.add(r.slug);
  }
}

function describe(slug) {
  const v = sources[slug];
  if (!v) return { slug, problem: "not in tool_sources.json" };
  const sourceUrl = v.privacy_policy;
  const domain = DOMAIN_OVERRIDES[slug] ?? new URL(sourceUrl).hostname.replace(/^www\./, "");
  const host = new URL(sourceUrl).hostname.toLowerCase();
  const hostOk = host === domain || host.endsWith(`.${domain}`);
  return { slug, name: v.name, domain, sourceUrl, hostOk };
}

const targets = (ONLY.length ? ONLY : PLAN).map(describe);

function skipReason(t) {
  if (t.problem) return t.problem;
  if (accepted.has(t.slug)) return "already submitted (see batch_submissions.jsonl)";
  if (publishedDomains.has(t.domain)) return "domain already published";
  if (!ONLY.length && HELD[t.slug]) return `HELD: ${HELD[t.slug]}`;
  return null;
}

const runnable = [];
console.log(`${GO ? "SUBMIT" : "DRY RUN"} against ${API}\n`);
for (const t of targets) {
  const why = skipReason(t);
  const tag = why ? "skip" : t.hostOk ? "send" : "WARN";
  console.log(`[${tag}] ${t.slug.padEnd(18)} ${t.domain ?? ""}  ${t.sourceUrl ?? ""}`);
  if (why) console.log(`       ${why}`);
  else if (!t.hostOk) console.log("       source host doesn't match domain -- backend would reject (source_url_domain_mismatch)");
  if (!why) runnable.push(t);
}
const batch = runnable.slice(0, LIMIT);
console.log(`\n${runnable.length} eligible; this run would submit ${batch.length} (limit ${LIMIT}).`);

if (!GO) {
  console.log("Dry run only. Nothing sent. Add --go to submit.");
  process.exit(0);
}

const key = process.env.POLICYPEEK_API_KEY;
if (!key) {
  console.error("\nPOLICYPEEK_API_KEY is not set. Run:  POLICYPEEK_API_KEY=\"$KEY\" node scripts/batch-submit.mjs --go");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 0; i < batch.length; i++) {
  const t = batch[i];
  let http = 0;
  let body = {};
  try {
    const res = await fetch(`${API}/v1/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": key },
      body: JSON.stringify({ domain: t.domain, source_url: t.sourceUrl, name: t.name }),
      signal: AbortSignal.timeout(60_000),
    });
    http = res.status;
    body = await res.json().catch(() => ({}));
  } catch (err) {
    body = { error: `network: ${err instanceof Error ? err.message : String(err)}` };
  }

  appendFileSync(
    LOG,
    JSON.stringify({
      ts: new Date().toISOString(),
      slug: t.slug,
      domain: t.domain,
      http,
      pending_check_id: body.pending_check_id ?? null,
      error: body.error ?? null,
      reason: body.reason ?? null,
    }) + "\n"
  );

  if (http === 202) {
    console.log(`  ok   ${t.slug}: queued as pending_check_id ${body.pending_check_id}`);
  } else if (http === 429) {
    console.error(
      `  STOP ${t.slug}: 429 daily_check_limit_reached. The API doesn't recognise the key as paid tier ` +
        `(wrong key, hash not inserted, row revoked, or key not exported). Nothing further sent.`
    );
    process.exit(1);
  } else {
    console.error(`  fail ${t.slug}: HTTP ${http} ${body.error ?? ""} ${body.reason ?? ""}`);
  }

  if (i < batch.length - 1) await sleep(DELAY_S * 1000);
}

console.log(
  "\nDone. Extraction runs in the background on the Worker, so give it a minute or two, then review the queue:\n" +
    '  curl -s -H "X-Admin-Token: $TOKEN" https://api.getpolicypeek.com/v1/admin/pending'
);
