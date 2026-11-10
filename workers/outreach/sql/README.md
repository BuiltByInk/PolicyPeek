# Outreach SQL (none of this is applied by any script)

- `../migrations/0001_outreach.sql`: the SCHEMA ONLY (tables + default settings paused='1', daily_cap='5', held_hand_list_received='0'). This is the only file applied in Security step (c).
- `verify-step-c.sql`: read-only checks after step (c). Every check must print `ok:`; any failure errors out.
- Contacts are NOT in the repo. `scripts/build-contacts-sql.ts` writes `contacts.sql` to a deliverables folder; by default every row is `paused` or `sent_by_hand` and nothing sets `card_confirmed`. Load it only after Security reviews that exact file.
- Verdict mirror (MF9/MF11): `scripts/refresh-verdicts.ts` is the daily job (design; NOT scheduled): fixed read-only SELECT export of policypeek-db, validation (>= 66 tools and >= the last good count, every known published tool present, valid non-empty verdicts, no duplicate keys), then UPDATEs of `card_gate.live_verdict/verdict_as_of` on policypeek-outreach only with `--apply`. Any failure writes nothing, and the sender requires a refresh the SAME UTC day, so nothing sends that day. `scripts/build-verdicts-sql.ts <tools.json> <gate.json> <out.sql> [previousCount]` is the manual equivalent and needs `PROD_TOOLS_AS_OF` (no file-time fallback).
- `step-f-setup-dev.sql` / `step-f-revert-dev.sql`: dev-only TEST send fixture and its revert (the revert also clears any pm.me TEST reply rows).
- `step-f-cleanup-prod-replies.sql`: after step (f), deletes the TEST reply rows and pm.me suppressions in the PRODUCTION outreach DB (aborts if a pm.me row matched a real contact).
