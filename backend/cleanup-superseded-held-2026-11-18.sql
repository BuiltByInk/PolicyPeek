-- ONE-OFF CLEANUP. NOT RUN. Needs Jump to coordinate and Elliot to approve
-- before anyone executes it against policypeek-db (remote).
--
-- Retires the 38 older duplicate held rechecks that piled up before the
-- supersede fix (PR "fix(check): a recheck supersedes older held rechecks").
-- Same effect as the new code: each older held recheck of a tool becomes
-- 'rejected' with a superseded_by note pointing at the newest held recheck of
-- that tool; its previous note is kept after "(was: ...)". The newest held
-- row per tool, held first-time submissions (is_recheck = 0, e.g. Zero
-- Deposit #144) and all non-'extracted' rows are untouched. Reversible: the
-- note records the prior status implicitly ('extracted') and any row can still
-- be approved directly.
--
-- 1) Preview (read-only). Expected on 18 Nov 2026: 38 rows.
SELECT p.id, p.domain, p.extraction_error,
       (SELECT MAX(p2.id) FROM pending_checks p2
         WHERE p2.domain = p.domain AND p2.is_recheck = 1 AND p2.status = 'extracted') AS newest_id
FROM pending_checks p
WHERE p.status = 'extracted' AND p.is_recheck = 1
  AND p.id < (SELECT MAX(p2.id) FROM pending_checks p2
               WHERE p2.domain = p.domain AND p2.is_recheck = 1 AND p2.status = 'extracted')
ORDER BY p.domain, p.id;

-- 2) Apply (WRITE; only after approval).
-- UPDATE pending_checks
--    SET status = 'rejected',
--        extraction_error = 'superseded_by #' ||
--          CAST((SELECT MAX(p2.id) FROM pending_checks p2
--                 WHERE p2.domain = pending_checks.domain AND p2.is_recheck = 1 AND p2.status = 'extracted') AS TEXT)
--          || ': one-off cleanup 2026-11 of duplicate held rechecks'
--          || COALESCE(' (was: ' || extraction_error || ')', ''),
--        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
--  WHERE status = 'extracted' AND is_recheck = 1
--    AND id < (SELECT MAX(p2.id) FROM pending_checks p2
--               WHERE p2.domain = pending_checks.domain AND p2.is_recheck = 1 AND p2.status = 'extracted');
--
-- 3) Rollback, if needed (WRITE):
-- UPDATE pending_checks
--    SET status = 'extracted',
--        extraction_error = CASE WHEN instr(extraction_error, ' (was: ') > 0
--          THEN substr(extraction_error, instr(extraction_error, ' (was: ') + 7, length(extraction_error) - instr(extraction_error, ' (was: ') - 7)
--          ELSE NULL END
--  WHERE status = 'rejected' AND extraction_error LIKE 'superseded_by #%: one-off cleanup 2026-11%';
