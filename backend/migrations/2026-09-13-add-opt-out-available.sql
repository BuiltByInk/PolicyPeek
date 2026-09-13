-- Phase 2.5i: add tools.opt_out_available and backfill it from each
-- published tool's originating pending_checks.extracted_facts JSON blob.
--
-- Safe to run against an existing populated `tools` table: ADD COLUMN with
-- no default leaves every existing row NULL, and a CHECK(... IN (0,1)) is
-- satisfied by NULL (SQLite only rejects a CHECK on an outright FALSE
-- result, not NULL) -- same pattern already used by trains_on_user_data /
-- gdpr_mentioned in schema.sql.
--
-- Run against LOCAL D1 only:
--   npx wrangler d1 execute policypeek-db --local --file=./migrations/2026-09-13-add-opt-out-available.sql
-- The equivalent --remote command for Elliot to run himself is in
-- DECISIONS_NEEDED.md / the Phase 2.5i final report (this pass never runs
-- --remote).

ALTER TABLE tools ADD COLUMN opt_out_available INTEGER CHECK (opt_out_available IN (0, 1));

-- Backfill: for each tool, find its most recent "approved/auto-published
-- from pending_check #N" changelog note, pull opt_out_available out of
-- that pending_check's extracted_facts JSON blob via json_extract. A tool
-- with no such note (nothing traceable back to a pending_check -- e.g. a
-- row created outside this pipeline) or whose blob has no
-- opt_out_available key is deliberately left NULL by this query, never
-- guessed.
UPDATE tools
SET opt_out_available = (
  SELECT json_extract(pc.extracted_facts, '$.opt_out_available')
  FROM compliance_changelog cc
  JOIN pending_checks pc
    ON pc.id = CAST(substr(cc.note, instr(cc.note, '#') + 1) AS INTEGER)
  WHERE cc.tool_id = tools.id
    AND cc.note LIKE '%pending_check #%'
    AND pc.extracted_facts IS NOT NULL
  ORDER BY cc.changed_at DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM compliance_changelog cc2
  JOIN pending_checks pc2
    ON pc2.id = CAST(substr(cc2.note, instr(cc2.note, '#') + 1) AS INTEGER)
  WHERE cc2.tool_id = tools.id
    AND cc2.note LIKE '%pending_check #%'
    AND pc2.extracted_facts IS NOT NULL
);
