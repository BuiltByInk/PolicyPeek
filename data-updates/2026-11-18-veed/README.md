# 18 November 2026 — add VEED (veed.io), rated on the Free plan

**Held for Elliot.** The steward's verdict (`not_compliant`) reverses Research's proposal (`compliant_with_caveats`), so this PR waits for Elliot's own yes, relayed by Jump. No merge, deploy or D1 write until then. Steward fact-check: `/workspace/deliverables/research/catalog-daily/factcheck-2026-11-18.md`. Evidence: `batch-2026-11-18.md` and the snapshots `batch-2026-11-18/veed-terms-of-use-2026-11-18.txt` and `veed-privacy-policy-2026-11-18.txt`.

Existing state checked 18 Nov 2026: `https://getpolicypeek.com/tools/veed.io/` returns 404, `api.getpolicypeek.com/v1/lookup?domain=veed.io` returns `not_found` (no `tools` row), and nothing for veed.io is in `frontend/data/tools.json`. So this is a new tool, not an update.

Apply `apply.sql` at deploy time (before any `scripts/refresh-site.mjs` run, which regenerates tools.json from D1), then `verify.sql`. One guarded INSERT for `veed.io`; the tools count goes from 67 to 68 (rated 66 to 67). If PR #60 (Freshdesk, also 67 to 68) lands first, rebase and move the counts in the two seo tests and `verify.sql` to 69/68.

## Card

- **VEED / veed.io:** new `not_compliant` (**Trains on your data, no opt-out**), rated on the Free plan. Same shape as DeepL (free tier rated, paid excluded) and InVideo (deleting your account is not an opt-out).
- Exactly the steward's two approved quotes, verbatim, string-matched against the snapshots (the source uses curly ‘Free’ quotes; the factcheck typed them straight):
  - (a) Terms of Use (last updated 28 August 2026): the Free-subscription content licence, including AI model training.
  - (b) Privacy Policy (last updated November, 2026, no day printed; fetched 18 November 2026): objecting means leaving the Free tier (delete the account or upgrade).
- Notes (steward card notes): rated on the Free plan; paid plans (Basic, Pro, Business) and enterprise content excluded from the licence; the privacy notice excludes mobile-app uploads; Free users can formally object but must then delete their account or upgrade; de-identified or aggregated derived information may be kept after erasure. No no-training claim is made for paid plans beyond the exclusion.
- Added to the video category.
