import { describe, expect, it } from "vitest";
import { makeDb } from "../../test-utils/d1shim";
import { runPurge } from "../src/purge";

const MIG = new URL("../migrations/0001_outreach.sql", import.meta.url).pathname;
const NOW = new Date("2028-12-01T03:30:00Z");

function seed(raw: any, slug: string, firstSend: string | null, resolvedAt: string | null) {
  const id = Number(raw.prepare("INSERT INTO outreach_contacts (tool_slug, tool_name, tool_domain, kind, contact_email, role, contact_source_url, policy_url, policy_label, question_text, vetted_by, vetted_at, status, resolved_at) VALUES (?, ?, ?, 'held', ?, 'privacy', ?, ?, 'P', 'q', 't', 't', 'eligible', ?)").run(slug, slug, slug, `privacy@${slug}`, `https://${slug}/p`, `https://${slug}/p`, resolvedAt).lastInsertRowid);
  if (firstSend) {
    raw.prepare("INSERT INTO outreach_sends (contact_id, tool_slug, contact_email, recipient_domain, kind, status, claimed_at) VALUES (?, ?, ?, ?, 'initial', 'sent', ?)").run(id, slug, `privacy@${slug}`, slug, firstSend);
    raw.prepare("INSERT INTO outreach_replies (matched_contact_id, tool_slug, from_domain, received_at, classification, raw_size) VALUES (?, ?, ?, ?, 'reply', 1)").run(id, slug, slug, firstSend);
  }
  return id;
}

describe("gate 6: retention purge", () => {
  it("deletes at 24 months from first email or 12 months after resolution, whichever first; logs counts only; keeps a minimal suppression", async () => {
    const { d1, raw } = makeDb(MIG);
    seed(raw, "old.example", "2026-11-20T09:00:00Z", null); // 24+ months since first email
    seed(raw, "resolved.example", "2027-06-01T09:00:00Z", "2027-11-01T00:00:00Z"); // resolved 13 months ago
    seed(raw, "recent.example", "2027-06-01T09:00:00Z", "2028-06-01T00:00:00Z"); // resolved 6 months ago, first email 18 months ago
    seed(raw, "fresh.example", "2028-11-01T09:00:00Z", null);
    raw.prepare("INSERT INTO outreach_replies (from_domain, received_at, classification, raw_size) VALUES ('stray.example', '2026-01-01T00:00:00Z', 'auto_reply', 1)").run();
    const r = await runPurge(d1, NOW);
    expect(r).toEqual({ replies_deleted: 3, sends_deleted: 2, contacts_deleted: 2 });
    expect(raw.prepare("SELECT tool_slug FROM outreach_contacts ORDER BY tool_slug").all().map((x: any) => x.tool_slug)).toEqual(["fresh.example", "recent.example"]);
    expect(raw.prepare("SELECT kind, value, reason FROM suppressions ORDER BY value").all()).toEqual([
      { kind: "address", value: "privacy@old.example", reason: "retention_purged" },
      { kind: "address", value: "privacy@resolved.example", reason: "retention_purged" },
    ]);
    const log = raw.prepare("SELECT * FROM purge_log").get();
    expect(log).toMatchObject({ replies_deleted: 3, sends_deleted: 2, contacts_deleted: 2 });
    expect(Object.keys(log)).toEqual(["id", "ran_at", "replies_deleted", "sends_deleted", "contacts_deleted"]);
  });
  it("is idempotent", async () => {
    const { d1, raw } = makeDb(MIG);
    seed(raw, "old.example", "2026-11-20T09:00:00Z", null);
    await runPurge(d1, NOW);
    expect(await runPurge(d1, NOW)).toEqual({ replies_deleted: 0, sends_deleted: 0, contacts_deleted: 0 });
  });
});
