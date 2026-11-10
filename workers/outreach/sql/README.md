# Outreach SQL (none of this is applied by any script)

- `../migrations/0001_outreach.sql`: the SCHEMA ONLY (tables + default settings paused='1', daily_cap='5', held_hand_list_received='0'). This is the only file applied in Security step (c).
- `verify-step-c.sql`: read-only checks after step (c). Every check must print `ok:`; any failure errors out.
- Contacts are NOT in the repo. `scripts/build-contacts-sql.ts` writes `contacts.sql` to a deliverables folder; by default every row is `paused` or `sent_by_hand` and nothing sets `card_confirmed`. Load it only after Security reviews that exact file.
- Verdict mirror: `scripts/build-verdicts-sql.ts` writes UPDATEs for `card_gate.live_verdict/verdict_as_of` from a read-only policypeek-db export. Run before each live day (36 h freshness).
