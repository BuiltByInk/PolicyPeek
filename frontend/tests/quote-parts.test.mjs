// D2 (best-answer plan, 18 Nov 2026): stored policy quotes with quote marks
// nested inside them must render whole. DeepSeek's quote used to render as
// just "you can opt out by turning off" (cut at the nested "Improve the model
// for everyone"), Meshy's opt-out and plan answer started mid-quote with
// ") from non-Enterprise ...", and GitHub showed a stray ". GitHub says".
// Same root cause: quoteParts() paired quote marks first-to-second.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = fileURLToPath(new URL("..", import.meta.url));
const tools = JSON.parse(readFileSync(join(FRONTEND, "data/tools.json"), "utf8"));

// src/*.ts uses extensionless imports; resolve them as .ts for this check.
const HOOK = `export async function resolve(s, c, n) { try { return await n(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return n(s + ".ts", c); throw e; } }`;
const run = (body) => JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e",
  `import { register } from "node:module"; register(${JSON.stringify("data:text/javascript," + encodeURIComponent(HOOK))});
   const m = await import(${JSON.stringify(join(FRONTEND, "src/toolAnswer.ts"))}); ${body}`], { encoding: "utf8" }));

const all = run(`const t = JSON.parse(process.argv[1]); console.log(JSON.stringify(Object.fromEntries(t.map((x) => [x.domain, { parts: m.quoteParts(x), opt: m.optOut(x), faq: m.genericFaq(x) }]))));`
  .replace("process.argv[1]", JSON.stringify(JSON.stringify(tools))));
const unit = (summary) => run(`console.log(JSON.stringify(m.quoteParts(${JSON.stringify({ name: "T", domain: "t.example", compliance_status: "compliant_with_caveats", summary, source_urls: [] })})));`);

test("nested quotes stay inside the outer quote", () => {
  assert.deepEqual(unit('Uses Inputs; "you can opt out by turning off "Improve the model for everyone"."'), ['you can opt out by turning off "Improve the model for everyone".']);
  assert.deepEqual(unit('"We may use Inputs (collectively, "User Content") to train models. You may opt out by email."'), ['We may use Inputs (collectively, "User Content") to train models. You may opt out by email.']);
  assert.deepEqual(unit('Says "first quoted clause here." Then "Privacy". Then "second quoted clause here."'), ["first quoted clause here.", "second quoted clause here."]);
});

test("unbalanced quote marks fall back to the old pairing (no worse than before)", () => {
  assert.deepEqual(unit('Says "an unclosed quote that keeps going and "another bit here"'), ["an unclosed quote that keeps going and"]);
});

test("DeepSeek, Meshy and GitHub render whole quotes", () => {
  assert.deepEqual(all["deepseek.com"].opt.quotes, ['you can opt out by turning off "Improve the model for everyone".']);
  const meshy = all["meshy.ai"];
  assert.equal(meshy.parts.length, 1);
  assert.match(meshy.parts[0], /^Meshy may use Customer Inputs .*\(collectively, "User Content"\) from non-Enterprise .*support@meshy\.ai\.$/);
  const plan = meshy.faq.find((f) => f.q === "Do free AI tools use my data for training?");
  assert.ok(plan && plan.a.includes('mentions plans: "Meshy may use Customer Inputs'), "Meshy's plan answer starts at the start of the quote");
  assert.ok(!all["github.com"].parts.some((p) => p.startsWith(".")));
  assert.ok(all["github.com"].parts.includes("Copilot Business and Copilot Enterprise users are not affected by this update."));
});

// Function words a real clause doesn't end on, unless the stored summary itself ends there.
const DANGLING = /\b(the|a|an|by|to|of|and|or|for|with|in|on|off|from|that|as|at|is|are|be),?$/i;
test("every rendered quote piece is a whole phrase, verbatim from the stored summary", () => {
  const bad = [];
  for (const t of tools) {
    for (const p of all[t.domain].parts) {
      const words = p.split(/\s+/).length;
      const s = t.summary.trim().replace(/^"|"$/g, "");
      if (!t.summary.includes(p)) bad.push(`${t.domain}: not verbatim: ${p}`);
      // Plan asks for ~6 words; two real full quotes are 5 words (Buffer, Tabnine).
      if (words < 5) bad.push(`${t.domain}: only ${words} words: ${p}`);
      if (/^[)\]},;:.!?]/.test(p)) bad.push(`${t.domain}: starts mid-quote: ${p}`);
      if (DANGLING.test(p) && !s.endsWith(p)) bad.push(`${t.domain}: ends mid-phrase: ${p}`);
    }
  }
  assert.deepEqual(bad, []);
});
