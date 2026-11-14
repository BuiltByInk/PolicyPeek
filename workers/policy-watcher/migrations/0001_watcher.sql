-- PolicyPeek policy watcher database (its OWN D1: policypeek-watcher /
-- policypeek-watcher-dev). Never policypeek-db; the watcher never writes a
-- verdict or the tools table. Not applied to any remote database yet.

-- F1: the ONLY URLs the watcher fetches. Seeded offline by
-- scripts/seed-watch-targets.ts from a read-only policypeek-db export.
CREATE TABLE IF NOT EXISTS watch_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  policy_url TEXT NOT NULL CHECK (policy_url LIKE 'https://%'),
  pinned_host TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (tool_slug, policy_url)
);

-- F5: robots.txt cache (24 h).
CREATE TABLE IF NOT EXISTS robots_cache (
  host TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  status INTEGER NOT NULL,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  targets INTEGER NOT NULL DEFAULT 0
);

-- One row per URL per run. Logs/rows never hold page text.
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  policy_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok_unchanged', 'ok_first', 'ok_changed', 'failed', 'blocked_robots', 'flagged_redirect', 'skipped')),
  reason TEXT,
  http_status INTEGER,
  final_host TEXT,
  content_kind TEXT,
  sha256 TEXT,
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_run ON results (run_id);

-- Last N snapshots per URL (text in R2). Hash index here.
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_slug TEXT NOT NULL,
  policy_url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  content_kind TEXT NOT NULL CHECK (content_kind IN ('html', 'text', 'pdf')),
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_url ON snapshots (url_hash, fetched_at);

-- Change records (24-month retention). Diff text in R2, capped at 20 KB.
CREATE TABLE IF NOT EXISTS changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  tool_slug TEXT NOT NULL,
  policy_url TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  old_sha256 TEXT NOT NULL,
  new_sha256 TEXT NOT NULL,
  diff_r2_key TEXT,
  diff_truncated INTEGER NOT NULL DEFAULT 0 CHECK (diff_truncated IN (0, 1)),
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0
);

-- For Research (read-only): what changed or needs a look, per day.
CREATE VIEW IF NOT EXISTS v_daily_changes AS
SELECT substr(r.checked_at, 1, 10) AS day, r.tool_slug, r.policy_url, r.status, r.reason, r.final_host, c.diff_r2_key, c.lines_added, c.lines_removed
FROM results r
LEFT JOIN changes c ON c.run_id = r.run_id AND c.policy_url = r.policy_url AND c.tool_slug = r.tool_slug
WHERE r.status IN ('ok_changed', 'flagged_redirect', 'blocked_robots');
