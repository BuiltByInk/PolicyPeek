# 10 November 2026 — Mailchimp to Policy unclear

Elliot approved at 11:45 UK, 10 November 2026 ("Mailchimp to unclear"), relayed by Jump. This follows the catalog fix in PR #46, which had kept Mailchimp's live not_compliant badge while removing the inaccurate no-opt-out line.

Do not run `scripts/refresh-site.mjs`. Apply `apply.sql` from `backend/` at deploy time, then `verify.sql`. Updates only `mailchimp.com`. The tools count stays 66.

## Change

- **Mailchimp / mailchimp.com:** `not_compliant` → `unrated` (**Policy unclear**), the same status and badge as the live Policy unclear cards (Buffer, Copy.ai).
- `trains_on_user_data` is set to NULL (both Buffer and Copy.ai).
- `opt_out_available` is set to NULL (Copy.ai; Buffer has 0). NULL is used so the row does not record a no-opt-out fact on an unclear card.
- `manual_override=1`.
- Card wording quotes the terms (Updated 10 October 2025) and notes that the Data analytics help page (no page date; fetched 10 November 2026) never mentions AI, models or training, so the published pages do not clearly say whether the use is on by default or whether that setting would stop it. It does not claim that Mailchimp trains, and it does not claim there is no opt-out.

Guide table badges that would otherwise keep Mailchimp as **Trains on your data, no opt-out** are updated so they match the catalog (required by `guide-verdicts.test.mjs`).
