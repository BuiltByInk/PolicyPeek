# Opt-out steps draft — five tools that currently only link to the source
Fetched / verified 9 Nov 2026 (Europe/London). **Prepared only — not applied to D1.**
Awaiting PolicyPeek steward fact-check (01f8d71c-8da7-4589-9362-c0f993de160c).

These are `compliant_with_caveats` tools whose stored summary has no opt-out quote
that the AEO template can render as steps, so the live page says “see the source”.

## 1. Cursor (`cursor.com`)
**Proposed steps (individual):**
1. Open Cursor Settings (macOS: Cmd+Shift+J; Windows/Linux: Ctrl+Shift+J).
2. Open **General** in the sidebar.
3. Turn **Privacy Mode** on.

With Privacy Mode on, Cursor says Customer Data is not used for training and it
maintains zero-data-retention agreements with model providers. Turning Privacy
Mode **off** allows Cursor to use codebase data, prompts, etc. to train models.

**Sources (cite):**
- https://cursor.com/data-use — “Last updated September 3, 2026” (fetched 9 Nov 2026)
- https://cursor.com/help/security-and-privacy/privacy — Privacy Mode steps (fetched via search/docs 9 Nov 2026)

**Caveats to keep:** Non-ZDR models may be designated separately / require admin
opt-in. Abuse/risk classifiers may still store flagged prompts per provider policy.

## 2. Grammarly (`grammarly.com`)
**Proposed steps (individual Free / Premium / single-user Pro):**
1. Open privacy settings at https://account.grammarly.com/security/privacy
   (Pro single-user: https://account.grammarly.com/data_settings — page also cites
   account.grammarly.com data settings).
2. Toggle **Product Improvement and Training** off.

**Multi-user (admin):** https://account.grammarly.com/admin/data_settings — only
admins can change the org toggle. Sales/Enterprise/Education: off by default.

**Sources:**
- https://support.grammarly.com/hc/en-us/articles/25555503115277-Product-Improvement-and-Training-Control
  (fetched 9 Nov 2026, HTTP 200; page has no explicit “last updated” in the extract)

**Caveats:** Default is **on** for individual Free/Premium/single-user Pro. Toggle
off stops content being used for training/product improvement for other users;
Grammarly may still use non-content stats.

## 3. Kimi (`kimi.com`)
**Proposed steps:**
1. Contact Kimi customer support and submit an opt-out request for model training
   (help page: “contact customer support … and submit a request”).
2. After identity verification, Kimi says opt-out registration completes in **5–7
   working days**, then conversation data stops being used for training.

**Sources:**
- https://www.kimi.com/en/help/others/data-usage (fetched 9 Nov 2026, HTTP 200)

**Caveats:** Account-level only (no per-conversation opt-out). Email address on the
page was Cloudflare-obfuscated in the fetch — steward should confirm the live
contact address from the page (do not invent one).

## 4. Otter.ai (`otter.ai`)
**Proposed steps:**
1. Go to **Account Settings → Meetings**.
2. Scroll to **Feedback and Training**.
3. Next to **Help improve Otter**, set the drop-down to **Don’t allow sharing**.

**Sources:**
- https://help.otter.ai/hc/en-us/articles/25352082563863-Provide-feedback-to-Otter
  — “August 26, 2025 18:15 Updated” (fetched 9 Nov 2026 via WebFetch)
- Privacy policy context: https://otter.ai/privacy-policy (fetched 9 Nov 2026)

**Caveats:** Setting is account-wide (not per conversation). Existing catalog note:
privacy policy also describes training on de-identified audio/transcripts; confirm
whether “Don’t allow sharing” fully covers that wording.

## 5. Perplexity AI (`perplexity.ai`)
**Proposed steps (Free / Pro / Max):**
1. Open **Account settings**.
2. Go to **Preferences**.
3. Turn off the **AI data retention** toggle (also referred to as AI Data Usage).

**Sources:**
- https://www.perplexity.ai/help-center/en/articles/11564572-data-collection-at-perplexity
  — “Last modified on August 31, 2026” (content via search index 9 Nov 2026;
  direct fetch returned 403/timeout — steward should re-open live)
- Related: https://www.perplexity.ai/help-center/en/articles/10352990-account-settings

**Caveats:** Default **on** for Free/Pro/Max. Opt-out applies only to data after
the change; previously collected training data “cannot be deleted or removed”.
Enterprise data is never used for training.

## Suggested storage shape (if steward approves)
Add verbatim opt-out quotes / short step sentences into each tool’s `summary`
(and keep badge/`compliance_status` unchanged), so the existing AEO `optOut()`
extractor can render them without a new schema. Guarded D1 UPDATE package would
live at `data-updates/2026-11-09-opt-out-steps/apply.sql` — **not run until Elliot OK**.
