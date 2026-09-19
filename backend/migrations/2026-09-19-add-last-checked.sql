-- Adds recheck bookkeeping to tools, so a "last checked" date can be shown and
-- stale entries found (Elliot, 2026-09-19).
--
--   last_checked_at  when the policy page was last read and the result confirmed
--                    or accepted (auto-publish or a human approval). NOT updated
--                    when a recheck finds a change that is waiting for review.
--   last_attempt_at  when a recheck was last attempted, successful or not. Used
--                    to back off from a tool whose page keeps failing.
--   last_check_note  why the last attempt did not confirm the entry (fetch
--                    failed, change awaiting review ...). NULL after a success.
--
-- Plain ADD COLUMN, no table rebuild. Backfill: last_checked_at starts as the
-- row's updated_at, the best available record of when it was last read; this is
-- an approximation for entries published before this column existed.
--
-- ORDER: apply AFTER 2026-09-18-add-not-ai-tool-status.sql. That migration rebuilds
-- the table with a fixed column list and would silently drop these columns.
-- MUST be applied BEFORE the backend that uses these columns is deployed (the
-- new code writes them on every publish). Rollback:
-- 2026-09-19-add-last-checked.rollback.sql

ALTER TABLE tools ADD COLUMN last_checked_at TEXT;
ALTER TABLE tools ADD COLUMN last_attempt_at TEXT;
ALTER TABLE tools ADD COLUMN last_check_note TEXT;

UPDATE tools SET last_checked_at = updated_at WHERE last_checked_at IS NULL;
