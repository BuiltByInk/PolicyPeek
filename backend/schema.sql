-- tools: the published, rated set of tools/domains.
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  -- 'compliant_with_caveats' added 2026-08-18 (Elliot's ruling): trains on
  -- user data by default with an opt-out is a materially weaker guarantee
  -- than opt-in/off-by-default, so it's split out of plain 'compliant' --
  -- see rules.ts::computeVerdict. SQLite has no `ALTER TABLE ... ADD CHECK`
  -- / can't alter an existing CHECK constraint in place, so any local D1
  -- created before this change needs a fresh migration, same as the
  -- auto_published column note below: drop the local D1 file and re-run
  -- `npm run db:migrate:local`. Do not run this against any real/deployed
  -- database.
  compliance_status TEXT NOT NULL DEFAULT 'unrated'
    CHECK (compliance_status IN ('not_compliant', 'compliant', 'compliant_with_caveats', 'unrated', 'shared_domain_unverified')),
  data_retention TEXT,
  trains_on_user_data INTEGER CHECK (trains_on_user_data IN (0, 1)),
  gdpr_mentioned INTEGER CHECK (gdpr_mentioned IN (0, 1)),
  source_urls TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  -- true when the only public policy for this tool lives on a domain shared
  -- with unrelated products (e.g. a Google/Microsoft AI feature whose policy
  -- is on the parent company's apex domain). Hard-overrides compliance_status
  -- to 'shared_domain_unverified' in rules.ts -- see computeVerdict.
  shared_domain INTEGER NOT NULL DEFAULT 0 CHECK (shared_domain IN (0, 1)),
  -- true when this row was published by evaluateAutoPublish (autoPublish.ts)
  -- rather than a human hitting the admin approve endpoint. Purely
  -- observability -- doesn't change how the row is served or verified.
  auto_published INTEGER NOT NULL DEFAULT 0 CHECK (auto_published IN (0, 1)),
  -- true when source_urls was fetched via the Wayback Machine fallback
  -- (waybackFallback.ts) because the vendor's live page actively blocks
  -- automated fetchers, not because the vendor doesn't exist. Always
  -- forces a human-queue result in evaluateAutoPublish, never auto-publishes.
  sourced_from_archive INTEGER NOT NULL DEFAULT 0 CHECK (sourced_from_archive IN (0, 1)),
  summary TEXT, -- one-line reason shown alongside the badge
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tools_domain ON tools (domain);

-- pending_checks: staging area for submitted domains awaiting extraction + admin review.
CREATE TABLE IF NOT EXISTS pending_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  -- optional human-friendly product name ("Kagi", not "kagi.com"). Carried
  -- into tools.name on approval when present; falls back to domain when
  -- absent (e.g. the browser extension's check-this-site flow, which has
  -- no product name to offer). Never overwrites an existing tools.name on
  -- a recheck -- see approvePendingCheck.
  name TEXT,
  is_recheck INTEGER NOT NULL DEFAULT 0 CHECK (is_recheck IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracted', 'approved', 'rejected')),
  source_url TEXT,
  raw_fetch TEXT, -- fetched policy text, HTML chrome stripped (see htmlClean.ts), truncated
  extracted_facts TEXT, -- JSON: facts only, no verdict (see backend agent notes)
  extraction_error TEXT,
  -- carried into tools.shared_domain on approval; set before approving a
  -- pending row whose only public policy lives on a shared corporate domain.
  shared_domain INTEGER NOT NULL DEFAULT 0 CHECK (shared_domain IN (0, 1)),
  -- see tools.sourced_from_archive above; archived_source_url is the actual
  -- web.archive.org snapshot URL fetched, for citation on the tool page.
  sourced_from_archive INTEGER NOT NULL DEFAULT 0 CHECK (sourced_from_archive IN (0, 1)),
  archived_source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_checks_status ON pending_checks (status);
CREATE INDEX IF NOT EXISTS idx_pending_checks_domain ON pending_checks (domain);

-- compliance_changelog: audit trail of every compliance_status change.
CREATE TABLE IF NOT EXISTS compliance_changelog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL REFERENCES tools (id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_changelog_tool_id ON compliance_changelog (tool_id);

-- api_keys: hashed API keys, resolved to a pricing tier on each request.
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hex digest of the raw key; raw key is never stored
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'paid')),
  label TEXT,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys (key_hash);

-- anonymous_check_log: server-side authoritative daily-cap enforcement for
-- POST /v1/check requests made without a registered API key (or with an
-- invalid/revoked one -- same "degrade to free" treatment as resolveTier
-- already applies to GET /v1/lookup, see auth.ts). One row per accepted
-- (not merely attempted) check. Identity is the caller's IP -- see
-- DECISIONS_NEEDED.md for the shared-IP/CGNAT/VPN tradeoff that choice
-- carries; a client-supplied anonymous token was the alternative and is
-- trivially resettable, which is worse for a real cost control.
CREATE TABLE IF NOT EXISTS anonymous_check_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_ip TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_anon_check_log_ip_time ON anonymous_check_log (client_ip, checked_at);

-- Known bug last build: a trigger scoped to UPDATE OF compliance_status only
-- silently misses the admin-approval INSERT path (a brand new tool never gets
-- a changelog row). Both triggers below are required, not just the UPDATE one.

CREATE TRIGGER IF NOT EXISTS trg_tools_changelog_on_insert
AFTER INSERT ON tools
BEGIN
  INSERT INTO compliance_changelog (tool_id, old_status, new_status, note)
  VALUES (NEW.id, NULL, NEW.compliance_status, 'trigger: insert');
END;

CREATE TRIGGER IF NOT EXISTS trg_tools_changelog_on_update
AFTER UPDATE OF compliance_status ON tools
WHEN OLD.compliance_status IS NOT NEW.compliance_status
BEGIN
  INSERT INTO compliance_changelog (tool_id, old_status, new_status, note)
  VALUES (NEW.id, OLD.compliance_status, NEW.compliance_status, 'trigger: update');
END;
