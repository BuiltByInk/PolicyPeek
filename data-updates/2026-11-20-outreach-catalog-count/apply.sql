-- 20 Nov 2026: refresh outreach_settings.catalog_tools_count 66 -> 69. policypeek-outreach ONLY.
-- PREPARED, NOT RUN. Needs Jump/Elliot's go-ahead. Run with:
--   npx wrangler d1 execute policypeek-outreach --remote --env production -c outreach/wrangler.jsonc --file ../data-updates/2026-11-20-outreach-catalog-count/apply.sql   (from workers/)
-- Why 69: refresh-verdicts.ts writes tools.length of its export (SELECT ... FROM tools, ALL rows of
-- policypeek-db, not_ai_tool included) and loader.ts validateExport refuses an export shorter than
-- max(MIN_CATALOG_TOOLS=66, this value). policypeek-db has 69 rows on 20 Nov (68 rated + hancocyber).
-- NOT required for sends: 69 >= 66 already passes, the next successful refresh writes 69 itself.
-- Guarded: changes the row only while it still reads '66'.
SELECT 'before' AS snapshot, key, value FROM outreach_settings WHERE key = 'catalog_tools_count';
UPDATE outreach_settings SET value = '69' WHERE key = 'catalog_tools_count' AND value = '66';
SELECT 'after' AS snapshot, key, value FROM outreach_settings WHERE key = 'catalog_tools_count';
