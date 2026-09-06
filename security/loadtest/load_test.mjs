// Phase 2.5 concurrency validation harness (see
// security/review-2026-09-06-concurrency.md for what this found). Fires
// real concurrent HTTP requests at the real local wrangler dev server (real
// local D1, real ssrf.ts/rateLimit.ts/admin.ts code paths, real Anthropic
// Haiku calls for anything that reaches extraction) -- deliberately NOT a
// unit test with a fake D1 mock, because the goal is to probe actual
// concurrent execution against actual D1, which a single-threaded in-memory
// fake can't surface. Local dev only -- never point BASE at anything else.
//
// Usage (from repo root):
//   1. cd backend && npm run db:migrate:local   (fresh local D1)
//   2. cd backend && npx wrangler dev --local --port 8787   (leave running)
//   3. node security/loadtest/mock_ssrf_server.mjs &   (only needed for `ssrf` mode)
//   4. node security/loadtest/load_test.mjs <mode> <N> [extra args]
//      modes: general <N> | ssrf <N> | ratelimit <N> [ip] |
//             samedomain-new <N> <domain> <sourceUrl> | samedomain-recheck <N>
// This harness creates real (if sometimes race-corrupted, that's the point)
// rows in local D1 -- drop tools/pending_checks/compliance_changelog/
// api_keys/anonymous_check_log (compliance_changelog first, it has the FK)
// and re-run `npm run db:migrate:local` afterward before trusting local D1
// for anything else.

const BASE = "http://localhost:8787";

function jitteredIp(seed) {
  // Synthetic, per-request IPs so unrelated requests never collide on the
  // real 1-per-24h anonymous cap -- only the rate-limit probe deliberately
  // reuses one IP across requests.
  return `203.0.113.${seed % 254}`;
}

async function submitCheck({ domain, sourceUrl, ip, name }) {
  const t0 = Date.now();
  let res, body;
  try {
    res = await fetch(`${BASE}/v1/check`, {
      method: "POST",
      headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
      body: JSON.stringify({ domain, source_url: sourceUrl, name }),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    return { domain, ip, status: "FETCH_ERROR", error: String(err), ms: Date.now() - t0 };
  }
  return { domain, ip, status: res.status, body, ms: Date.now() - t0 };
}

async function adminQuery(sql) {
  const { execSync } = await import("node:child_process");
  const out = execSync(
    `npx wrangler d1 execute policypeek-db --local --command ${JSON.stringify(sql)} --json`,
    { cwd: "/home/jumpspot/policypeek/backend", encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
  );
  return JSON.parse(out)[0].results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const REAL_DOMAINS = [
  ["deepl.com", "https://www.deepl.com/en/privacy"],
  ["cursor.com", "https://cursor.com/privacy"],
  ["claude.com", "https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training"],
  ["notion.com", "https://www.notion.com/trust/privacy-policy"],
  ["grammarly.com", "https://www.grammarly.com/privacy-policy-november-2024"],
  ["ideogram.ai", "https://ideogram.ai/legal/privacy"],
  ["kagi.com", "https://kagi.com/privacy"],
  ["fireflies.ai", "https://fireflies.ai/privacy-policy"],
  ["granola.ai", "https://docs.granola.ai/help-center/policies/privacy-policy"],
  ["heygen.com", "https://www.heygen.com/privacy"],
];

async function runGeneralStress(n) {
  console.log(`\n===== GENERAL STRESS: N=${n} concurrent, mixed real domains =====`);
  // Fresh IP base per invocation, same reasoning as runSameDomainRace --
  // otherwise back-to-back general-stress runs collide on the same IPs and
  // report the (already-confirmed) rate-limit race's steady-state 429s
  // instead of measuring general robustness.
  const ipBase = Date.now() % 100000;
  const tasks = [];
  for (let i = 0; i < n; i++) {
    const [domain, sourceUrl] = REAL_DOMAINS[i % REAL_DOMAINS.length];
    tasks.push(submitCheck({ domain, sourceUrl, ip: jitteredIp(ipBase + i), name: null }));
  }
  const results = await Promise.all(tasks);
  const byStatus = {};
  for (const r of results) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log("status breakdown:", byStatus);
  const errors = results.filter((r) => r.status === "FETCH_ERROR" || r.status >= 500);
  if (errors.length) console.log("ERRORS:", JSON.stringify(errors, null, 2));
  return results;
}

async function runSsrfRace(n) {
  console.log(`\n===== SSRF RACE: N=${n} concurrent malicious-redirect requests =====`);
  const tasks = [];
  for (let i = 0; i < n; i++) {
    tasks.push(
      submitCheck({
        domain: `sr${i}.localhost`,
        sourceUrl: `http://sr${i}.localhost:8765/redirect-blocked`,
        ip: jitteredIp(2000 + i),
        name: null,
      })
    );
  }
  const results = await Promise.all(tasks);
  const notBlocked = results.filter((r) => r.status !== 400);
  console.log(`${results.length - notBlocked.length}/${results.length} correctly blocked (400)`);
  if (notBlocked.length) console.log("NOT BLOCKED (potential race):", JSON.stringify(notBlocked, null, 2));
  return { results, notBlocked };
}

async function runRateLimitRace(n, sameIp) {
  console.log(`\n===== RATE-LIMIT RACE: N=${n} concurrent requests, SAME client IP (${sameIp}) =====`);
  const tasks = [];
  for (let i = 0; i < n; i++) {
    // Cycle through distinct real domain/URL pairs (must match exactly --
    // isSourceHostAllowedForDomain requires source_url's host to equal the
    // submitted domain) so we're isolating the IP-cap race, not the
    // domain-uniqueness race (that's runSameDomainRace below). Needs
    // n <= REAL_DOMAINS.length to stay collision-free on domain identity.
    const [domain, sourceUrl] = REAL_DOMAINS[i % REAL_DOMAINS.length];
    tasks.push(submitCheck({ domain, sourceUrl, ip: sameIp, name: null }));
  }
  const results = await Promise.all(tasks);
  const accepted = results.filter((r) => r.status === 202);
  const capped = results.filter((r) => r.status === 429);
  console.log(`accepted (202): ${accepted.length}, capped (429): ${capped.length}, other: ${results.length - accepted.length - capped.length}`);
  if (accepted.length > 1) {
    console.log("RACE CONFIRMED: more than 1 request from the same IP got through the 1-per-24h cap");
    console.log(JSON.stringify(accepted, null, 2));
  }
  return { results, accepted, capped };
}

async function runSameDomainRace(n, label, domain, sourceUrl) {
  console.log(`\n===== SAME-DOMAIN RACE (${label}): N=${n} concurrent submissions of ${domain} =====`);
  // Fresh IP base per invocation -- each racer needs its OWN never-before-used
  // IP so the (separately, already-confirmed) rate-limit race doesn't
  // interfere with what THIS probe is isolating (the domain race).
  const ipBase = Date.now() % 100000;
  const tasks = [];
  for (let i = 0; i < n; i++) {
    tasks.push(submitCheck({ domain, sourceUrl, ip: jitteredIp(ipBase + i), name: null }));
  }
  const results = await Promise.all(tasks);
  const accepted202 = results.filter((r) => r.status === 202);
  console.log(`${accepted202.length}/${n} accepted at the HTTP layer (202) -- extraction runs in the background, waiting to settle...`);
  if (accepted202.length < n) console.log("non-202 results:", JSON.stringify(results.filter((r) => r.status !== 202), null, 2));
  await sleep(9000); // let ctx.waitUntil's background extraction + auto-publish settle
  const toolRows = await adminQuery(`SELECT id, domain, compliance_status, updated_at FROM tools WHERE domain = '${domain}'`);
  const changelogRows = await adminQuery(
    `SELECT c.id, c.old_status, c.new_status, c.note, c.changed_at FROM compliance_changelog c JOIN tools t ON t.id = c.tool_id WHERE t.domain = '${domain}' ORDER BY c.id`
  );
  const pendingRows = await adminQuery(
    `SELECT id, status, extraction_error FROM pending_checks WHERE domain = '${domain}' ORDER BY id`
  );
  console.log("tools row(s) for this domain:", JSON.stringify(toolRows, null, 2));
  console.log("changelog rows:", JSON.stringify(changelogRows, null, 2));
  console.log("pending_checks outcomes:", JSON.stringify(pendingRows, null, 2));
  return { results, toolRows, changelogRows, pendingRows };
}

const mode = process.argv[2];

if (mode === "general") {
  const n = Number(process.argv[3]);
  await runGeneralStress(n);
} else if (mode === "ssrf") {
  const n = Number(process.argv[3]);
  await runSsrfRace(n);
} else if (mode === "ratelimit") {
  const n = Number(process.argv[3]);
  const ip = process.argv[4] || `198.51.100.${Math.floor(Math.random() * 254)}`;
  await runRateLimitRace(n, ip);
} else if (mode === "samedomain-new") {
  const n = Number(process.argv[3]);
  // domain must match source_url's host (isSourceHostAllowedForDomain) --
  // use a real domain/URL pair directly, not a fake domain pointed at a
  // real site's policy page (that would just 400 on the mismatch check).
  // Pass a domain never touched this session so submission-time isRecheck
  // is genuinely false for every racer, not contaminated by an earlier run.
  const domain = process.argv[4];
  const url = process.argv[5];
  await runSameDomainRace(n, "brand-new domain, concurrent first INSERT", domain, url);
} else if (mode === "samedomain-recheck") {
  const n = Number(process.argv[3]);
  // Seed the domain first with a single successful check, then hammer it with concurrent rechecks.
  console.log("Seeding domain first...");
  const seed = await submitCheck({ domain: "kagi.com", sourceUrl: "https://kagi.com/privacy", ip: jitteredIp(9999), name: null });
  console.log("seed result:", JSON.stringify(seed));
  await sleep(6000);
  await runSameDomainRace(n, "existing domain, concurrent UPDATE (recheck)", "kagi.com", "https://kagi.com/privacy");
} else {
  console.log("usage: node load_test.mjs <general|ssrf|ratelimit|samedomain-new|samedomain-recheck> <N>");
}
