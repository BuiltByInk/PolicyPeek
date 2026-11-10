# 10 November 2026 daily catalog — LOCAL ONLY

Prepared from steward-approved `/workspace/deliverables/research/catalog-daily/factcheck-2026-11-10.md` and its `batch-2026-11-10/` snapshots. Live source pages were re-fetched and quote-matched on 10 November 2026 (Europe/London). `apply.sql` is a future-review artifact only: it has NOT been applied to D1. No migrations, secrets, bulk regeneration, PR, push or deploy are part of this package. This package needs its own Elliot OK, relayed by Jump, before anyone runs it.

## Live dedup checked 10 November 2026 (Europe/London)

- `https://getpolicypeek.com/tools/duckduckgo.com/` returns 404.
- `https://getpolicypeek.com/tools/duck.ai/` returns 404.
- `https://getpolicypeek.com/tools/zendesk.com/` returns 404.
- Homepage, `/tools/` (64 live tools) and `sitemap-0.xml` have no Duck.ai, DuckDuckGo or Zendesk entry.
- Zero Deposit (inbound, same day) remains held and is absent from the added data.

## Only these changes

- **Duck.ai (DuckDuckGo AI Chat) / duckduckgo.com:** new `compliant` entry (**Doesn't train on your data**). Catalogued under duckduckgo.com, with product URL https://duck.ai/. Four approved verbatim quotes: the Duck.ai Privacy Policy and Terms of Service (last updated 1 October 2026), the undated Duck.ai help page (fetch date 10 November 2026), and the undated Optional AI help page (fetch date; the company-wide no-training statement). The card notes that DuckDuckGo states the no-training rule company-wide for its AI features, so the badge on duckduckgo.com does not overclaim for those other features. If you choose to share a chat as feedback, DuckDuckGo says it will store and review it to improve its products; that is not stated as training. The general privacy policy date is not printed (it reads "06-03-26" and is not needed as a source). This is an evidence exception to the shared-domain hold, not a change to that rule; Gemini, Amazon Q and NotebookLM stay held. `shared_domain` stays false so the badge remains "Doesn't train on your data", not "Company-wide policy".
- **Zendesk AI / zendesk.com:** new `compliant_with_caveats` entry (**Trains by default, you can opt out**). Three approved verbatim quotes from the Supplemental Terms (effective 23 June 2026 for new customers and 23 July 2026 for existing customers; article updated 9 November 2026) and Zendesk AI Data Use Information (updated 27 May 2026). Card wording states that the opt-out is for the Zendesk account holder (the business), per subdomain, via Zendesk customer support, and that people who email a company's Zendesk helpdesk can't opt out themselves. Training is on Zendesk's own non-generative models; third-party generative LLMs don't train on the data. Timing of the opt-out and free-trial availability are left out (unstated). A steward-backed FAQ override on the tool page restates the account-holder / per-subdomain wording.

Both use manual publication metadata; the prepared-only SQL sets `manual_override=1` to protect full quotes from pipeline truncation/rechecks. It never updates existing target verdicts. Held items stay out. No unrelated catalog rows are touched.

## Quote checks and future safety

Every added quotation matches the fact-check file and was re-matched against both the research snapshots and freshly fetched live HTML (whitespace collapsed; curly vs straight quotes normalised). The four Duck and two Zendesk live HTML snapshots were byte-identical to the research snapshots. Committed quote text keeps the steward-approved straight apostrophes and the em dash in the Optional AI sentence.

Do not run generate-tools-json or refresh-site for this draft. Before any later public application, obtain explicit approval for this package, re-check target state, save full before-row snapshots/backups, and use atomic batch execution. apply.sql includes fail-closed target guards; it deliberately has no whole-catalog count assumptions. Nothing here authorizes D1 execution or deployment.

## Local verification

See `/workspace/deliverables/dev/catalog-daily-2026-11-10/SUMMARY.txt` after the local build/tests.
