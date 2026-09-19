import type { Env } from "./index";
import { cleanText } from "./textUtil";

// Bookkeeping for "when was this tool last checked" (migration
// 2026-09-19-add-last-checked.sql). `last_checked_at` is set by the publish
// paths in admin.ts (auto-publish and human approval), because that is the
// moment a result was confirmed or accepted. This module records the other
// half: an ATTEMPT that did not confirm the entry, with a short reason, so a
// tool whose page keeps failing is visible and doesn't hog the daily recheck
// slots. All of it is a no-op for a domain that isn't published yet.

const NOTE_MAX = 200;

// Records that a recheck was attempted just now. `note` says why it did not
// confirm the entry (or null for "starting an attempt": the note is cleared
// only by a successful publish, so an attempt marker never hides an earlier
// failure reason).
export async function markToolAttempt(env: Env, domain: string, note: string | null = null): Promise<void> {
  const cleaned = cleanText(note, NOTE_MAX);
  if (cleaned === null) {
    await env.DB.prepare("UPDATE tools SET last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE domain = ?")
      .bind(domain)
      .run();
    return;
  }
  await env.DB.prepare(
    "UPDATE tools SET last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_check_note = ? WHERE domain = ?"
  )
    .bind(cleaned, domain)
    .run();
}
