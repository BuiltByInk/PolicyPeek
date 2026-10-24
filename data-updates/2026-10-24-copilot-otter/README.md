# 2026-10-24 Copilot + Otter verdict fix: frontend done, D1 PREPARED NOT RUN

The admin API has no endpoint to edit a published verdict (only pending approve/reject and demote), so this PR changes
frontend/data/tools.json directly. Until `apply.sql` is run on D1, `scripts/refresh-site.mjs` will show these two rows
reverting in its diff: answer "no" or run apply.sql first.

Evidence (checked 24 Oct 2026):
- GitHub changelog 2026-03-25: "from April 24 onward we will begin using interaction data—specifically inputs, outputs, code snippets, and associated context—from Copilot Free, Pro, and Pro+ users to train and improve our AI models unless you opt out. Copilot Business and Copilot Enterprise users are not affected by this update." https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/
- Otter help centre: "Allow sharing will allow Otter ... permission to access all of your conversations in your account for training and product improvement" / "If your setting is set to Don't allow sharing ... Otter will not access your conversation for training and product improvement." https://help.otter.ai/hc/en-us/articles/25352082563863-Provide-feedback-to-Otter
