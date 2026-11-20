-- Roll back the 20 Nov catalog_tools_count update: 69 -> 66. policypeek-outreach ONLY.
-- Guarded: changes the row only while it still reads '69' (a later successful refresh may
-- legitimately have written 69 or more, then do NOT roll back without checking).
UPDATE outreach_settings SET value = '66' WHERE key = 'catalog_tools_count' AND value = '69';
SELECT 'after_rollback' AS snapshot, key, value FROM outreach_settings WHERE key = 'catalog_tools_count';
