# 18 November 2026 — add Freshdesk Freddy (freshdesk.com)

New tool under Elliot's standing catalog rule (8 Nov 2026: steward-checked, ready tools ship without per-tool approval). Steward fact-check: `/workspace/deliverables/research/catalog-daily/factcheck-2026-11-17.md`. Evidence: `batch-2026-11-17.md` and the snapshot `batch-2026-11-17/freshworks-supplemental-terms-2026-11-17.txt`. Jump asked Dev to merge, deploy and run this on 18 Nov.

Apply `apply.sql` at deploy time (before any `refresh-site.mjs` run), then `verify.sql`. One guarded INSERT for `freshdesk.com`; the tools count goes from 67 to 68. No other row or badge changes. QuickBooks AI (held) is not included.

## Card

- **Freshdesk Freddy / freshdesk.com:** new `compliant_with_caveats` (**Trains by default, you can opt out**), same shape as Zendesk AI.
- Two verbatim quotes from Freshworks Supplemental Terms (https://www.freshworks.com/terms/supplemental-terms/, Effective Date March 6, 2026), per the steward's 18 Nov ruling: §4(c), the training licence by default when AI Services are used; and §4(d)(ii), the all-AI-training opt-out by email. Both string-matched against the snapshot. The third-party generative model carve-out is in the notes, not quoted.
- Notes: §4(d) opt-out by email to support@freshworks.com at two levels (Collaborative Models only, which keeps the AI Services working, possibly with reduced performance; All AI Training); stops within seven business days; licence expires 180 days after termination or opt-out; account holder (the business) only, not end users or helpdesk contacts; on by default once AI Services are used; terms take precedence over the FAQ; no training of third-party hosted generative AI models. No plan claims; nothing said to be off by default.
- FAQ override on the tool page (Zendesk precedent) restates the account-holder opt-out. Added to the workplace category next to Zendesk.
- `frontend/src/toolAnswer.ts`: one-line regex fix so the auto FAQ "Do free AI tools use my data for training?" does not treat "royalty-free" (in the §4(c) quote) as a plan mention. Without it the page would say the policy "mentions plans". Built output otherwise only changes counts (67→68) and related-tool links; Meshy and others keep their existing FAQ.
