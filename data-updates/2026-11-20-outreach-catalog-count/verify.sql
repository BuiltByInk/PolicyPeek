-- Verify the 20 Nov catalog_tools_count update. Read-only. policypeek-outreach ONLY.
-- Fails (json() error) unless exactly one catalog_tools_count row exists and it reads '69',
-- and the other settings (paused, daily_cap, held_hand_list_received) are still present.
SELECT key, value FROM outreach_settings ORDER BY key;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_settings WHERE key = 'catalog_tools_count') = 1 THEN 'ok: exactly 1 catalog_tools_count row' ELSE json('VERIFY FAILED: catalog_tools_count row count') END AS verify_rows;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_settings WHERE key = 'catalog_tools_count' AND value = '69') = 1 THEN 'ok: catalog_tools_count = 69' ELSE json('VERIFY FAILED: catalog_tools_count value') END AS verify_value;
SELECT CASE WHEN (SELECT COUNT(*) FROM outreach_settings WHERE key IN ('paused','daily_cap','held_hand_list_received')) = 3 THEN 'ok: other settings present (unchanged by apply)' ELSE json('VERIFY FAILED: other settings') END AS verify_others;
