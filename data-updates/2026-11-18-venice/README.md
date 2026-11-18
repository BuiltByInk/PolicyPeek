# 18 November 2026 — add Venice AI (venice.ai)

Elliot approved at 09:12 UK, 18 November 2026 ("Yes, publish Venice as Doesn't train once the steward has checked it"), relayed by Jump. Steward fact-check: `/workspace/deliverables/research/catalog-daily/factcheck-venice-2026-11-18.md`. Research: `/workspace/deliverables/research/venice-reply-check-2026-11-18.md` (snapshots alongside).

Do not run `scripts/refresh-site.mjs` before `apply.sql` (it regenerates tools.json from D1). Apply `apply.sql` at deploy time, then `verify.sql`. One guarded INSERT for `venice.ai`; the tools count goes from 66 to 67. No other row or badge changes.

## Card

- **Venice AI / venice.ai:** new `compliant` entry (**Doesn't train on your data**), the same shape as the Duck.ai row.
- Only quote: Terms of Service §10.2 (https://venice.ai/legal/tos, last updated 8 June 2026, checked 18 November 2026), matched verbatim against the research snapshot.
- Steward edits: the §7.4 feedback licence caveat (Duck.ai style), and the provider promise is limited to third-party LLM (text model) providers; the card does not claim it covers image or video model providers.
- Storage notes (not training): Privacy Policy (effective 2 June 2026) no-storage of prompt/output content with temporary video storage until download; Anonymous mode provider storage (venice.ai/privacy); API prompt cache of minutes to about an hour.
- The "Fin" AI support-agent reply is not cited.
- Added to the AI chat tools category.
