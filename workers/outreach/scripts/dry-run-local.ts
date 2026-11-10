// Local dry run: loads the reviewed contacts.sql into an in-memory D1 shim with
// the default settings and prints what the sender would do today. Sends nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { makeDb } from "../../test-utils/d1shim";
import { checkContact, planDay, render, runDaily } from "../src/send";

const [, , contactsSql, outFile] = process.argv;
const MIG = new URL("../migrations/0001_outreach.sql", import.meta.url).pathname;
const db = makeDb(MIG);
db.raw.exec(readFileSync(contactsSql, "utf8"));
const now = new Date();
const lines: string[] = [];
const p = (s = "") => lines.push(s);

(async () => {
  p(`PolicyPeek outreach DRY RUN, ${now.toISOString()} (UTC). Nothing was sent. Local in-memory D1 loaded from contacts.sql.`);
  p(`Defaults: OUTREACH_MODE=dry_run, OUTREACH_ENABLED unset, paused=1, daily_cap=5 (hard max 5), held_hand_list_received=0.`);
  const r = await runDaily({ DB: db.d1 } as any, now);
  p(`\n== A. TODAY, real state (kill switch still OFF, so nothing can send; this is what the first live run would pick) ==\nwould send: ${r.planned}`);
  for (const x of r.rendered) p(`  queue ${x.kind} ${x.tool_slug} -> ${(db.raw.prepare("SELECT contact_email e FROM outreach_contacts WHERE tool_slug = ?").get(x.tool_slug) as any)?.e} | card gate: ${x.card_gate}`);
  for (const s of r.skipped) p(`  skip ${s.tool_slug}: ${s.reason}`);

  // B: what the queue would look like once the hand-sent list arrives and the
  // held contacts are marked eligible (still capped). Hypothetical, for review only.
  db.raw.exec("UPDATE outreach_settings SET value='1' WHERE key='held_hand_list_received'; UPDATE outreach_contacts SET status='eligible', paused_reason=NULL WHERE status='paused';");
  const plan = await planDay(db.d1, now);
  p(`\n== B. HYPOTHETICAL: hand-sent list received + held rows set eligible (cap ${plan.cap}) ==\nwould send: ${plan.queue.length}`);
  for (const c of plan.queue) {
    const e = render(c);
    p(`\n--- ${c.kind.toUpperCase()} | tool ${c.contact.tool_slug} | to ${c.contact.contact_email} | card gate: ${c.gateReason}`);
    p(`From: PolicyPeek <privacy@mail.getpolicypeek.com>\nReply-To: privacy@getpolicypeek.com\nSubject: ${e.subject}\n\n${e.text}`);
  }
  p(`\nskipped in B:`);
  for (const s of plan.skipped) p(`  skip ${s.tool_slug}: ${s.reason}`);
  // C: every contact that would pass all gates over the coming days (ignoring the daily cap)
  p(`\n== C. HYPOTHETICAL first-wave eligible list (every per-contact gate, ignoring the daily cap; would go out over several days) ==`);
  const contacts = db.raw.prepare("SELECT * FROM outreach_contacts ORDER BY id").all();
  const all: any[] = [];
  for (const c of contacts) {
    const r = await checkContact(db.d1, c, "initial", now);
    if (!r.ok) continue;
    try { render({ contact: c, kind: "initial", recipientDomain: r.recipientDomain, gateReason: r.gateReason }); } catch { continue; }
    all.push(c);
    p(`  ${c.tool_slug} | ${c.contact_email} | ${c.contact_source_url} | ${r.gateReason}`);
  }
  writeFileSync(outFile, lines.join("\n") + "\n");
  console.log(`A planned ${r.planned}; B ${plan.queue.length}; C ${all.length}`);
})();
