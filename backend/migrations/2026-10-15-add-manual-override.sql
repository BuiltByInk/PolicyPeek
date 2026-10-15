-- Adds tools.manual_override (2026-10 fact-check). 1 = a person hand-curated this
-- entry's badge/summary/source; scheduled rechecks and public resubmissions then
-- never auto-publish over it (evaluateAutoPublish queues them for /v1/admin/pending).
-- A human /approve still writes the row, deliberately.
-- Plain ADD COLUMN, no rebuild. Apply BEFORE deploying the backend that reads it
-- (the new code SELECTs manual_override). Rollback: 2026-10-15-add-manual-override.rollback.sql
ALTER TABLE tools ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0, 1));
