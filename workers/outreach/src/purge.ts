// Gate 6: retention purge (LIA / privacy notice). Replies and outreach records
// are deleted 12 months after the tool's question is resolved, or 24 months
// after the first email, whichever comes first. Unmatched reply metadata goes
// after 24 months. The contact's address is kept only as a minimal suppression
// row (reason retention_purged) so it is never re-contacted. Logs counts only.
const MONTH = 30.4375 * 86_400_000;

export async function runPurge(db: D1Database, now = new Date()): Promise<{ replies_deleted: number; sends_deleted: number; contacts_deleted: number }> {
  const resolvedCut = new Date(now.getTime() - 12 * MONTH).toISOString();
  const firstCut = new Date(now.getTime() - 24 * MONTH).toISOString();
  const due = (
    await db
      .prepare(
        `SELECT c.id, c.contact_email FROM outreach_contacts c
         LEFT JOIN (SELECT contact_id, MIN(claimed_at) AS first_at FROM outreach_sends GROUP BY contact_id) s ON s.contact_id = c.id
         WHERE (c.resolved_at IS NOT NULL AND c.resolved_at < ?) OR (s.first_at IS NOT NULL AND s.first_at < ?) OR (c.hand_sent_at IS NOT NULL AND c.hand_sent_at <> 'unknown' AND c.hand_sent_at < ?)`,
      )
      .bind(resolvedCut, firstCut, firstCut)
      .all<{ id: number; contact_email: string }>()
  ).results;
  let replies = 0, sends = 0, contacts = 0;
  for (const c of due) {
    const res = await db.batch([
      db.prepare("INSERT OR IGNORE INTO suppressions (kind, value, reason) VALUES ('address', ?, 'retention_purged')").bind(c.contact_email.toLowerCase()),
      db.prepare("DELETE FROM outreach_replies WHERE matched_contact_id = ?").bind(c.id),
      db.prepare("DELETE FROM outreach_sends WHERE contact_id = ?").bind(c.id),
      db.prepare("DELETE FROM outreach_test_sends WHERE contact_id = ?").bind(c.id),
      db.prepare("DELETE FROM outreach_contacts WHERE id = ?").bind(c.id),
    ]);
    replies += res[1].meta.changes ?? 0;
    sends += res[2].meta.changes ?? 0;
    contacts += res[4].meta.changes ?? 0;
  }
  const orphan = await db.prepare("DELETE FROM outreach_replies WHERE matched_contact_id IS NULL AND received_at < ?").bind(firstCut).run();
  replies += orphan.meta.changes ?? 0;
  await db.prepare("INSERT INTO purge_log (ran_at, replies_deleted, sends_deleted, contacts_deleted) VALUES (?, ?, ?, ?)").bind(now.toISOString(), replies, sends, contacts).run();
  return { replies_deleted: replies, sends_deleted: sends, contacts_deleted: contacts };
}
