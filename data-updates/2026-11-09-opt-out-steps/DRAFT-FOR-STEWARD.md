# Fact-check: opt-out steps draft — 9 Nov 2026 (Europe/London)
Steward review of `data-updates/2026-11-09-opt-out-steps/DRAFT-FOR-STEWARD.md` (PR #41, not merged). Read-only. No push, merge, commit, deploy, or D1 change.

Snapshots: `/workspace/deliverables/research/opt-out-steps-2026-11-09/` (SOURCE/FETCHED headers on each `.txt`).

## Rulings
| Tool | Ruling | Action |
|---|---|---|
| Cursor (cursor.com) | READY | Keep draft steps; match vendor verbs below if rewriting |
| Grammarly (grammarly.com) | FIX | Correct Pro single-user URL to `admin/data_settings` |
| Kimi (kimi.com) | FIX | Add contact channel `support@moonshot.cn` |
| Otter.ai (otter.ai) | READY | Keep steps; keep de-identified-training caveat |
| Perplexity AI (perplexity.ai) | READY | Keep steps; note primary-domain 403 / Mintlify mirror |

---

## 1. Cursor — READY
**Draft steps match the vendor help page.** Privacy Mode is the training control.

**Approved steps (individual):**
1. Open Cursor Settings (macOS: Cmd+Shift+J; Windows/Linux: Ctrl+Shift+J).
2. Click **General** in the sidebar.
3. Toggle **Privacy Mode** on.

(Vendor wording uses “Click General” / “Toggle Privacy Mode on”. Draft’s “Open” / “Turn … on” is equivalent; prefer the vendor verbs above.)

**Sources:**
- https://cursor.com/help/security-and-privacy/privacy — no page date; fetch 9 Nov 2026 (`cursor-privacy-help.txt`)
- https://cursor.com/data-use — “Last updated September 3, 2026” (`cursor-data-use.txt`)

**Verbatim quotes:**
- “1. Open Cursor Settings: Mac: Press Cmd + Shift + J Windows/Linux: Press Ctrl + Shift + J / 2. Click General in the sidebar / 3. Toggle Privacy Mode on”
- “If you enable “ Privacy Mode” in Cursor’s settings: Customer Data will not be used for training by Cursor. Cursor maintains zero data retention (ZDR) agreements with all providers, and AI model providers will not store or train on your data.”
- “If you choose to turn off “Privacy Mode”: we may use and store codebase data, prompts, editor actions, code snippets, and other code data and actions to improve our AI features and train our models.”
- “For teams, Privacy Mode is enabled by default for all team members.”
- “Non-ZDR models will be designated as such or require an admin to opt-in to enable the model for your workspace.”

**Caveats (keep):** Non-ZDR models may be designated separately / require admin opt-in. Abuse/risk classifiers may still store flagged prompts per provider policy. Teams/Enterprise: Privacy Mode on by default; admins can enforce org-wide.

---

## 2. Grammarly — FIX
**Setting name and Free/Premium path are correct. Pro single-user URL in the draft is wrong.**

Draft said Pro single-user → `https://account.grammarly.com/data_settings`.  
Vendor page says Pro accounts with one user → `https://account.grammarly.com/admin/data_settings` (same admin URL as multi-user).

**Corrected steps (individual Free / Premium):**
1. Go to https://account.grammarly.com/security/privacy
2. Click the **Product Improvement and Training** toggle to turn it off.

**Corrected steps (Grammarly Pro, one user):**
1. Go to https://account.grammarly.com/admin/data_settings
2. Click the **Product Improvement and Training** toggle to turn it off.

**Multi-user (admin):** https://account.grammarly.com/admin/data_settings — only admins can change the org toggle. Sales / Enterprise / Education (and Sales-purchased Pro/Business): off by default. Website-purchased multi-user Pro: on by default.

**Sources:**
- https://support.grammarly.com/hc/en-us/articles/25555503115277-Product-Improvement-and-Training-Control — no explicit last-updated in extract; fetch 9 Nov 2026 (`grammarly-product-improvement-training.txt`)

**Verbatim quotes:**
- “Product Improvement and Training is on for individual users by default.”
- “For Grammarly Free and Premium Accounts: 1. Go to your account’s privacy settings at account.grammarly.com/security/privacy. 2. Click the “Product Improvement and Training” toggle to change its setting.”
- “For Grammarly Pro accounts with one user: 1. Go to your account’s data settings at account.grammarly.com/admin/data_settings. 2. Click the “Product Improvement and Training” toggle to change its setting.”
- “Go to your account’s data settings at https://account.grammarly.com/admin/data_settings. … Only admins can change the Product Improvement and Training setting for multi-user accounts.”
- “For all Grammarly for Education, Grammarly Business, Pro, and Grammarly Enterprise accounts purchased through our Sales team, Product Improvement and Training is automatically off”
- “When this control is turned off, none of the content a user inputs into an application or website where our product is active will be used for training or product improvement for other users. We may still collect non-content data, such as writing statistics … and may use that data for product improvement and training.”

**Caveats (keep):** Default on for Free / Premium / single-user Pro and for website-purchased multi-user. Toggle off stops content being used for training/product improvement for other users; Grammarly may still use non-content stats.

---

## 3. Kimi — FIX
**Timing and account-level scope match. Contact email was readable on the live page (not obfuscated in this fetch).**

**Corrected steps:**
1. Email Kimi customer support at **support@moonshot.cn** and submit an opt-out request for model training.
2. After identity verification, Kimi says opt-out registration completes in **5–7 working days**, then conversation data stops being used for training (historical and new).

**Sources:**
- https://www.kimi.com/en/help/others/data-usage — page JSON `updatedAt` 2026-11-05T14:02:06.395Z; fetch 9 Nov 2026 (`kimi-data-usage.txt`)

**Verbatim quotes:**
- “If you do not want your conversation data to be used for training, you can contact customer support at support@moonshot.cn and submit a request. We will complete the opt-out registration within 5-7 working days after verifying your identity, and will stop using your content for model training.”
- “Account-level opt-out: Per-conversation or per-file opt-out is not currently supported.”
- “Once registration is complete, neither your historical conversation data nor any newly generated data will be included in the model training dataset.”
- “A core commitment of Kimi Business (the enterprise plan) is that enterprise data does not enter the model training pipeline”

**Caveats (keep):** Account-level only. Enterprise/Kimi Business is out of the training pipeline by default (separate from the consumer support opt-out).

---

## 4. Otter.ai — READY
**Menu path and setting names match the help article.** Opt-out covers training access for conversations (past and future) per that article.

**Approved steps:**
1. Go to **Account Settings → Meetings**.
2. Scroll to **Feedback and Training**.
3. Next to **Help improve Otter**, set the drop-down to **Don’t allow sharing**.

**Sources:**
- https://help.otter.ai/hc/en-us/articles/25352082563863-Provide-feedback-to-Otter — “August 26, 2025 18:15 Updated”; fetch 9 Nov 2026 via WebFetch (`otter-provide-feedback.txt`; plain curl got Cloudflare 403)
- https://otter.ai/privacy-policy — Effective June 16, 2026 (`otter-privacy-policy.txt`)

**Verbatim quotes (help):**
- “Manage your feedback and training permissions in Account Settings > Meetings.”
- “1. Navigate to Account Settings > Meetings. 2. Scroll down to Feedback and Training. 3. Next to Help improve Otter, set your preference in the drop-down.”
- “If your setting is set to Don’t allow sharing, when submitting feedback, Otter will not access your conversation for training and product improvement.”
- “Access to all past conversations will be removed for training. / Future conversations will not be used for training.”
- “Setting the option in Account Settings > Meetings > Feedback and Training will affect all of your conversations.”

**Verbatim quote (privacy policy — caveat source):**
- “Improve and monitor the Services, including training our proprietary AI technology on de-identified audio recordings and on transcriptions (which may contain Personal Information)” (legal basis listed as Consent or Legitimate interests)

**Caveats (keep, strengthened):** Setting is account-wide. The help article states Don’t allow sharing removes training access for past and future conversations. The privacy policy still lists de-identified audio/transcript training as a processing purpose and does **not** name the Meetings → Feedback and Training control. Do not claim the drop-down extinguishes every training purpose in the privacy policy; the steps are still accurate as Otter’s documented feedback/training control.

---

## 5. Perplexity AI — READY
**Steps match the official Help Center article.** Toggle covers AI model training (not only retention of threads). Alternate UI label “AI Data Usage” is documented on Account Settings.

**Approved steps (Free / Pro / Max):**
1. Open **Account settings** (https://www.perplexity.ai/account/details).
2. Go to **Preferences** (https://www.perplexity.ai/account/preferences).
3. Turn off the **AI data retention** toggle (also referred to as **AI Data Usage**).

**Sources:**
- https://www.perplexity.ai/help-center/en/articles/11564572-data-collection-at-perplexity — “Last modified on August 31, 2026” (search index of the live article). Canonical domain returned Cloudflare 403 to curl and WebFetch on 9 Nov 2026. Body confirmed via official Mintlify Help Center mirror `https://perplexity-help-center.mintlify.app/help-center/en/articles/11564572-data-collection-at-perplexity.md` (HTTP 200; mirror instructs citing the canonical URL). Snapshot: `perplexity-data-collection.txt`.
- https://www.perplexity.ai/help-center/en/articles/10352990-account-settings — same 403 on canonical; Mintlify mirror fetched 9 Nov 2026 (`perplexity-account-settings.txt`).
- API docs https://docs.perplexity.ai/guides/privacy-security cover the API platform (no consumer Preferences toggle) — not used for these steps.

**Verbatim quotes:**
- “For Free, Perplexity Pro and Perplexity Max users, AI Data Retention is enabled by default. However, these users can control whether their data is used for AI model training.”
- “Navigate to your Account settings / Go to the Preferences page / Locate the AI data retention toggle / … / Toggle off to opt out of AI training data collection”
- “Opt-outs only apply to data collected after the opt-out date”
- “Previously collected training data cannot be deleted or removed”
- “Enterprise customers’ data is never used or retained for training AI models”
- “Data may still be processed for service operation, legal compliance, and product improvement”
- Account Settings: “AI data retention: Enabling the “AI Data Usage” feature allows for your search data to be used to improve Perplexity’s AI models (Sonar). If you prefer to exclude your data from this process, simply turn off this setting.”

**Caveats (keep):** Default on for Free/Pro/Max. Opt-out is forward-looking only. Enterprise never trained. Opt-out does not stop all processing (service / legal / product improvement). Cite the canonical help URL, not the Mintlify host.

---

## Steward notes for Jump / Dev
- Badge / `compliance_status` unchanged for all five (`compliant_with_caveats`).
- Apply only after Elliot OK; no D1 until then.
- Grammarly and Kimi need the FIX text above before packaging `apply.sql`.
- Cursor / Otter / Perplexity are READY as drafted (Cursor: prefer vendor “Click” / “Toggle” verbs).
