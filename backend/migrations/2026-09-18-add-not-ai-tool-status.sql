-- Adds 'not_ai_tool' to tools.compliance_status's CHECK constraint.
--
-- SQLite can't alter a CHECK in place, so this rebuilds the table: copy the
-- rows into a temporary tools_backup, drop tools, recreate it under the SAME
-- name with the widened CHECK, copy the rows back with ids preserved, then
-- drop the backup and recreate the index and both changelog triggers
-- (dropping tools drops its triggers and index with it).
--
-- compliance_changelog.tool_id REFERENCES tools(id). Dropping the parent
-- makes SQLite count every referencing changelog row as a violation, and
-- that count only clears when rows are inserted into a table actually NAMED
-- tools. (An earlier draft built tools_new and renamed it in; the count never
-- cleared and D1 rolled the whole migration back at commit.) Hence
-- PRAGMA defer_foreign_keys plus recreating tools by name before the commit.
-- The copy-back runs before the triggers exist, so it writes no spurious
-- changelog rows.
--
-- Column list matches the live D1 table (opt_out_available was added by
-- ALTER TABLE, so it sits last there).
--
-- Rollback: 2026-09-18-add-not-ai-tool-status.rollback.sql

PRAGMA defer_foreign_keys = true;

CREATE TABLE tools_backup AS SELECT * FROM tools;

DROP TABLE tools;

CREATE TABLE tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  compliance_status TEXT NOT NULL DEFAULT 'unrated'
    CHECK (compliance_status IN ('not_compliant', 'compliant', 'compliant_with_caveats', 'unrated', 'shared_domain_unverified', 'not_ai_tool')),
  data_retention TEXT,
  trains_on_user_data INTEGER CHECK (trains_on_user_data IN (0, 1)),
  gdpr_mentioned INTEGER CHECK (gdpr_mentioned IN (0, 1)),
  source_urls TEXT NOT NULL DEFAULT '[]',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  shared_domain INTEGER NOT NULL DEFAULT 0 CHECK (shared_domain IN (0, 1)),
  auto_published INTEGER NOT NULL DEFAULT 0 CHECK (auto_published IN (0, 1)),
  sourced_from_archive INTEGER NOT NULL DEFAULT 0 CHECK (sourced_from_archive IN (0, 1)),
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  opt_out_available INTEGER CHECK (opt_out_available IN (0, 1))
);

INSERT INTO tools (
  id, name, domain, compliance_status, data_retention, trains_on_user_data,
  gdpr_mentioned, source_urls, verified, shared_domain, auto_published,
  sourced_from_archive, summary, created_at, updated_at, opt_out_available
)
SELECT
  id, name, domain, compliance_status, data_retention, trains_on_user_data,
  gdpr_mentioned, source_urls, verified, shared_domain, auto_published,
  sourced_from_archive, summary, created_at, updated_at, opt_out_available
FROM tools_backup;

DROP TABLE tools_backup;

CREATE INDEX idx_tools_domain ON tools (domain);

CREATE TRIGGER trg_tools_changelog_on_insert
AFTER INSERT ON tools
BEGIN
  INSERT INTO compliance_changelog (tool_id, old_status, new_status, note)
  VALUES (NEW.id, NULL, NEW.compliance_status, 'trigger: insert');
END;

CREATE TRIGGER trg_tools_changelog_on_update
AFTER UPDATE OF compliance_status ON tools
WHEN OLD.compliance_status IS NOT NEW.compliance_status
BEGIN
  INSERT INTO compliance_changelog (tool_id, old_status, new_status, note)
  VALUES (NEW.id, OLD.compliance_status, NEW.compliance_status, 'trigger: update');
END;
