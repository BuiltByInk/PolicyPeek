-- Task 2/3 additions (13 Nov 2026). Own D1 only (policypeek-watcher).
-- Never applied to policypeek-db. Not applied to any remote database yet.

-- Consecutive fetch failures per target. A successful fetch resets the count.
-- After 3 failures in a row, a row is written to elliot_queue.
ALTER TABLE watch_targets ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0);

-- Elliot's review queue: failed auto-publish gates, 3x fetch failures, second-opinion disagreements.
-- Suggested verdict may be null on a dry run (no model). Never written to policypeek-db.
CREATE TABLE IF NOT EXISTS elliot_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  policy_url TEXT,
  old_quote TEXT,
  new_quote TEXT,
  suggested_verdict TEXT,
  failed_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared'))
);
CREATE INDEX IF NOT EXISTS idx_elliot_queue_open ON elliot_queue (status, created_at);

-- Card changes that passed the Task 3 gate. This worker NEVER applies them to
-- policypeek-db or tools.json; deploy/publish stays a separate, approved step.
CREATE TABLE IF NOT EXISTS proposed_publishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  policy_url TEXT,
  old_direction TEXT NOT NULL,
  new_direction TEXT NOT NULL,
  quotes_json TEXT NOT NULL,
  change_id INTEGER
);

-- Neutral change log for the public /changes/ page and RSS.
-- Verdict-direction changes need elliot_approved=1 before they may be exported.
-- Wording-only changes that passed the gate may be marked publishable=1.
CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  tool_name TEXT,
  policy_url TEXT,
  summary TEXT NOT NULL,
  verdict_direction_changed INTEGER NOT NULL DEFAULT 0 CHECK (verdict_direction_changed IN (0, 1)),
  elliot_approved INTEGER NOT NULL DEFAULT 0 CHECK (elliot_approved IN (0, 1)),
  publishable INTEGER NOT NULL DEFAULT 0 CHECK (publishable IN (0, 1))
);
