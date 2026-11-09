# 9 November 2026 Slack AI wording — LOCAL ONLY

Scope change relayed by Jump (9 Nov): Slack AI wording is in scope. Badge and
`compliance_status` unchanged (`compliant_with_caveats`, **Trains by default,
you can opt out**). All four 8 Nov quotes kept verbatim. `apply.sql` is a
prepared artifact only: it has NOT been run against D1. No push, PR, merge,
deploy or D1 command is part of this change.

## What changed

- **Plain-language answer** (shown under the H1 and as the H1's FAQPage answer):
  steward-approved text in `frontend/src/toolOverrides.ts`. Kept out of
  `tools.json` on purpose: that file is regenerated from D1 and would drop an
  extra field.
- **FAQ** "Can I stop Slack AI training on my data?": steward-approved answer,
  also in `toolOverrides.ts`. It replaces the generated answer to the same
  question, in both the visible FAQ and the single FAQPage JSON-LD.
- **Quotes** added to `summary` (after the four existing quotes):
  - Privacy principles: "Slack aggregates and disassociates Customer Data such that Slack's use of Customer Data to update the Services will never identify any of our customers or individuals as the source of any of these improvements to any third party, other than to Slack's affiliates or sub-processors."
  - Security for AI features in Slack: "Customer data never leaves Slack-controlled infrastructure and is never used to train large language models (LLMs)."
- **Source added**: https://slack.com/intl/en-gb/help/articles/28310650165907-Security-for-AI-features-in-Slack
- `last_checked_at` 2026-11-08T18:06:01.777Z -> 2026-11-09T08:53:00.000Z (both
  pages fetched and all six quotes re-matched then). The trailing note now
  names both fetch dates.

## Quote check

Both live pages fetched 9 Nov 2026 08:53 UTC with curl (HTTP 200), tag-stripped
and saved under `research/qa-sources/2026-11-09-slack/`. Both new quotes and all
four existing quotes match after normalising whitespace and curly vs straight
quotes only. `frontend/tests/aeo-tool-pages.test.mjs` re-checks this.

## Before any public application

Fresh approval, re-check the live row, save a before-row backup, run
`apply.sql` atomically. Do not run generate-tools-json/refresh-site before
`apply.sql` is applied, or the summary and source would revert.
