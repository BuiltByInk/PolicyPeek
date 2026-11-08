# 8 November 2026 daily catalog — LOCAL ONLY

Prepared from steward-approved `/workspace/deliverables/research/catalog-daily/factcheck-2026-11-08.md` and its `batch-2026-11-08/` snapshots. No public change is approved. `apply.sql` is a future-review artifact only: it has NOT been applied to D1. No migrations, secrets, bulk regeneration, PR, push or deploy are part of this batch.

## Live dedup checked 8 November 2026 (Europe/London)

- `https://getpolicypeek.com/` and `https://getpolicypeek.com/sitemap-0.xml` contain no Slack tool; `https://getpolicypeek.com/tools/slack.com/` returns 404.
- `https://getpolicypeek.com/tools/fireflies.ai/` exists: compliant / **Doesn't train on your data**. Its existing no-training quote is preserved verbatim.
- `https://getpolicypeek.com/tools/zoom.com/` exists: compliant / **Doesn't train on your data**, with the terms quote and two source URLs already present.
- Fetched origin/main already has Zoom compliant, trains_on_user_data=false, and both URLs. The reported unrated state is stale: no verdict or URL sync is needed in this commit.

## Only these changes

- **Slack AI / slack.com:** new `compliant_with_caveats` entry (**Trains by default, you can opt out**). Four approved verbatim quotes distinguish default-on global predictive-model training from generative-model opt-in. Opt-out is workspace-level, requested by an owner; page does not distinguish free vs paid. Source: https://slack.com/intl/en-gb/trust/data-management/privacy-principles — no page date; fetched 8 November 2026.
- **Fireflies.ai:** retain compliant and existing quote/source; append the approved Zero Data Retention meeting-content/Fireflies Talk clause to summary, and add the approved 30-day deletion-after-account-close sentence to data_retention. This does not imply Fireflies itself retains no meeting data: the zero-retention clause names third-party vendors. Source: https://fireflies.ai/privacy-policy — last updated 28 September 2026.
- **Zoom AI Companion:** retain compliant, the exact existing terms quote (https://www.zoom.com/en/trust/terms/ — effective 11 August 2023), and source order; append the exact approved privacy-statement quote and identify its date, **17 September 2026** (https://www.zoom.com/en/trust/privacy/privacy-statement/). That second URL was already present and is not duplicated.

All three use manual publication metadata; the prepared-only SQL sets manual_override=1 to protect full quotes from pipeline truncation/rechecks. It never updates existing target verdicts. Existing-source URLs and unrelated facts are preserved. Asana AI and ClickUp remain held, absent from the added data. No unrelated catalog rows are touched.

## Quote checks and future safety

Every added quotation matches the fact-check file exactly. All seven quotes were re-matched against snapshots, collapsing whitespace (Fireflies HTML text splits the Zero Data Retention heading across lines) and normalizing curly apostrophes for Slack's opt-out subject. The committed text keeps the steward-approved straight apostrophes. Zoom's existing terms quote also matches its snapshot.

Do not run generate-tools-json or refresh-site for this draft. Before any later public application, obtain explicit approval, re-check target state, save full before-row snapshots/backups, and use atomic batch execution. apply.sql includes fail-closed target guards; it deliberately has no whole-catalog count assumptions. No rollback can safely be generated until real before-rows are captured. Nothing here authorizes D1 execution or deployment.

## Local verification

Node 22.23.3: Astro build passed. All seven added quotes render untruncated in the three local HTML pages, along with the intended badges and Zoom source date. JSON invariants confirm only Slack was added, only Fireflies/Zoom existing rows changed, every existing verdict was preserved, and no Asana/ClickUp was added. Prepared SQL was checked only in a synthetic in-memory Python SQLite fixture: its three resulting rows match tools.json; duplicate Slack, changed Fireflies verdict, changed Zoom summary, and missing Zoom all fail closed.

Full frontend suite: **47 passed / 18 failed**. One failure is methodology.test.mjs's unrelated claude.com FAQPage count assertion (0 vs 1); the other 17 are submit-form browser tests whose shared setup cannot find Playwright's chromium_headless_shell-1217 executable. These were not fixed in this catalog-only batch. No production tests or endpoints were modified.
