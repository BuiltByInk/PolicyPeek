// Recheck cadence shown on /methodology/. Mirrors backend/src/cron.ts
// (RECHECK_AFTER_DAYS, MAX_RECHECKS_PER_RUN) and the daily "0 4 * * *" cron in
// backend/wrangler.toml; tests/methodology.test.mjs fails if they drift.
export const RECHECK_DAYS = 30;
export const MAX_PER_RUN = 3;
