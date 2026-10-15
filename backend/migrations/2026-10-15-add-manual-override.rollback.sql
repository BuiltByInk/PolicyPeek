-- Reverts 2026-10-15-add-manual-override.sql. Roll the backend back first.
ALTER TABLE tools DROP COLUMN manual_override;
