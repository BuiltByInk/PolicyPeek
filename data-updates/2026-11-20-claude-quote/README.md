# 20 November 2026 — Claude card: replace our own words with verbatim quotes

Build-only. Do not run `apply.sql` against D1, and do not run `scripts/refresh-site.mjs`, until a deploy is approved. This folder is a guarded one-row update so D1 can be brought into step with `frontend/data/tools.json` at deploy time.

Steward fact-check: `/workspace/deliverables/research/catalog-daily/factcheck-claude-2026-11-18.md` (re-fetch about 11:20 GMT / Europe/London on 18 November 2026). Snapshots are in `factcheck-claude-2026-11-18/`. The badge stays **Trains by default, you can opt out** (`compliant_with_caveats`). No verdict change.

The same misquoted text first appeared in commit c1a4a0c (15 October 2026) and is also corrected in `frontend/src/qa.ts` and two guides. There was no earlier `data-updates/*/apply.sql` row for `claude.com`.

## Change

Updates only `claude.com`:

- **`summary`:** the two Privacy Policy sentences (Effective Sep 10, 2026), kept as separate sentences: "We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings." "This Privacy Policy does not apply to content that we process on behalf of customers of our business offerings, such as our Enterprise accounts."
- **`data_retention`:** the Privacy Policy 30-day deletion sentence, replacing the paraphrase "Feedback data stored for up to 5 years in secured back-end".
- **`source_urls`:** keeps `https://www.anthropic.com/legal/privacy` and adds `https://www.anthropic.com/legal/commercial-terms` (Effective Jun 17, 2025), which is the source of the Q&A and guide quote "Anthropic may not train models on Customer Content from Services."
- **`last_checked_at`:** `2026-11-18T11:20:00.000Z` (the steward's re-fetch).
- **`manual_override=1`.** `compliance_status`, `trains_on_user_data` and the badge are unchanged.

The steward's notes paragraph is in `frontend/src/toolOverrides.ts` (not a D1 column).

## How to apply (when approved)

From `backend/`, apply `apply.sql`, then `verify.sql`. Tested only on a scratch SQLite database; not run against D1.
