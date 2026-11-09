# 9 November 2026 daily catalog — LOCAL ONLY (combined with AEO PR)

Prepared from steward-approved `/workspace/deliverables/research/catalog-daily/factcheck-2026-11-09.md` and its `batch-2026-11-09/` snapshots. Live source pages were re-fetched and quote-matched on 9 November 2026 (Europe/London). `apply.sql` is a future-review artifact only: it has NOT been applied to D1. No migrations, secrets, bulk regeneration, merge or deploy are part of this package. Elliot's 9 Nov 09:04 D1 approval named only the Slack wording update (runbook 4d); this package (runbook 4e) needs its own OK before anyone runs it.

## Live dedup checked 9 November 2026 (Europe/London)

- `https://getpolicypeek.com/tools/monday.com/` returns 404.
- `https://getpolicypeek.com/tools/intercom.com/` returns 404.
- Homepage list has no Monday.com or Intercom Fin entry (live catalog still at 62 tools after PR #37).
- Calendly remains held and is absent from the added data.

## Only these changes

- **Monday.com AI / monday.com:** new `compliant` entry (**Doesn't train on your data**). Three approved verbatim quotes from https://monday.com/l/legal/ai/ (Last Updated: May 05, 2026). The admin opt-out is from using interaction data to improve monday.com's Services, not from training (which the AI Terms say never happens); the clarifying prose after the quotes says so, and the AEO opt-out section is not shown for `compliant` rows.
- **Intercom Fin / intercom.com:** new `compliant_with_caveats` entry (**Trains by default, you can opt out**). Four approved verbatim quotes from https://www.intercom.com/help/en/articles/11993352-ai-model-training-and-fine-tuning (dated September 8, 2026). Opt-out is workspace-level via Settings > Workspace > Security > AI model training and fine-tuning; processing can take up to 30 days. No "no free plan" claim. The privacy-policy training sentence about publicly available web data is not used as a customer-data quote.

Both use manual publication metadata; the prepared-only SQL sets `manual_override=1` to protect full quotes from pipeline truncation/rechecks. It never updates existing target verdicts. Calendly stays held. No unrelated catalog rows are touched.

## Quote checks and future safety

Every added quotation matches the fact-check file and was re-matched against both the research snapshots and freshly fetched live HTML (whitespace collapsed; curly vs straight quotes normalised). The Intercom opt-out sentence is stored in full through the Settings path, matching the live help article (the fact-check bullet truncated after "through").

Do not run generate-tools-json or refresh-site for this draft. Before any later public application, obtain explicit approval for this package (separate from Slack 4d), re-check target state, save full before-row snapshots/backups, and use atomic batch execution. apply.sql includes fail-closed target guards; it deliberately has no whole-catalog count assumptions. Nothing here authorizes D1 execution or deployment.

## Local verification

See `/workspace/deliverables/dev/aeo-2026-11-09/SUMMARY.txt` after the combined AEO build/tests.
