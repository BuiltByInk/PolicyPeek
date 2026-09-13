-- Rollback for 2026-09-13-add-opt-out-available.sql.
-- Requires SQLite 3.35+ (DROP COLUMN) -- D1 is on a modern SQLite build so
-- this is expected to work, but was not verified against real D1 (would
-- require --remote, outside this pass's scope).
--
--   npx wrangler d1 execute policypeek-db --local --file=./migrations/2026-09-13-add-opt-out-available.rollback.sql

ALTER TABLE tools DROP COLUMN opt_out_available;
