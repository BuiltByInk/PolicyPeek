# 10 November 2026 catalog fix — Mailchimp, Meshy, Kling AI

Elliot approved at 11:44 UK, 10 November 2026 ("Yep" to "fix all three"), following the steward ruling in `factcheck-recheck-2026-11-10.md`. Quotes, sources and dates are taken from that ruling and its snapshots (fetched 10 November 2026, 11:39 Europe/London).

Do not run `scripts/refresh-site.mjs` (D1 and tools.json are out of sync). Apply `apply.sql` from `backend/` at deploy time, then `verify.sql`.

## Only these changes

- **Mailchimp / mailchimp.com:** held. The live badge stays `not_compliant` (**Trains on your data, no opt-out**), per the 4 Nov rule that a card moved to held keeps its current live badge. The inaccurate "no opt-out found" / "PolicyPeek found no opt-out" line is removed. The card now quotes the terms (Updated 10 October 2025) on machine-learning use and account settings, and the help page (no page date; fetched 10 November 2026) on the Data analytics setting, which never mentions AI, models or training and so is not confirmed as a training opt-out.
- **Meshy / meshy.ai:** `not_compliant` → `compliant_with_caveats` (**Trains by default, you can opt out**). Card wording as Research proposed: opt out by emailing support@meshy.ai. Training is on for Free/Pro unless you email support. Enterprise is not trained on under this clause. Source: Terms of Use, last updated 19 September 2026.
- **Kling AI / kling.ai:** `not_compliant` → `compliant_with_caveats` (**Trains by default, you can opt out**). Steward rejected Research's hold and recommended caveats; Elliot confirmed. Clause 4.7.4: withdraw by emailing support@kling.ai. That is a support-only revocation on a default-on licence and may not reach usage or aggregated data. The privacy policy (readable at `/docs/privacy-policy`) says nothing about training. Sources: User Policy and Privacy Policy, last updated / effective 21 April 2026.

All three rows set `manual_override=1`. The tools count stays 66.

Guide tables that would otherwise keep the old Meshy and Kling badges are updated so they match the catalog (required by `guide-verdicts.test.mjs`). Mailchimp remains on the no-opt-out list with its live badge; the "no opt-out found" reason line is removed there too.
