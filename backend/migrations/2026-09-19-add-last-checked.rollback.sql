-- Reverts 2026-09-19-add-last-checked.sql. Roll the backend back first (the new
-- code writes these columns), then run this. Drops only the three added columns.
ALTER TABLE tools DROP COLUMN last_check_note;
ALTER TABLE tools DROP COLUMN last_attempt_at;
ALTER TABLE tools DROP COLUMN last_checked_at;
