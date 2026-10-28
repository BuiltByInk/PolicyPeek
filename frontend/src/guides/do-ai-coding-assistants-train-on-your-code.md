# Do AI Coding Assistants Train on Your Code? Copilot, Tabnine, JetBrains and App Builders

*Last checked: 28 October 2026. Verdicts come from each company's own published policy, read by [PolicyPeek](https://getpolicypeek.com/). Not legal advice.*

It depends on the tool and plan. Tabnine and Sourcegraph Cody (Pro teams and Enterprise) say they don't train on your code. GitHub Copilot (Free, Pro and Pro+), JetBrains AI (free licence), Lovable and Bolt.new train by default but let you opt out. Base44's terms allow training with no opt-out found. Cursor and Windsurf are under review, so PolicyPeek doesn't rate them for now. ([All tools](https://getpolicypeek.com/tools/))

## Which coding tools train on your code?

| Tool | PolicyPeek verdict | What the policy says (PolicyPeek summary) | Source | Last checked |
|---|---|---|---|---|
| [Tabnine](https://getpolicypeek.com/tools/tabnine.com/) | **Doesn't train on your data** | "Tabnine has a *no-train-no-retain* policy." and "Tabnine does not train on your code." | [policy](https://docs.tabnine.com/main/welcome/readme/privacy.md) | 2026-10-24 |
| [Sourcegraph Cody](https://getpolicypeek.com/tools/sourcegraph.com/) | **Doesn't train on your data** | Sourcegraph and Sourcegraph Partner LLMs do not use code from Cody Enterprise or Cody Pro teams to train models. | [policy](https://sourcegraph.com/terms/cody-notice) | 2026-10-21 |
| [JetBrains AI Assistant](https://getpolicypeek.com/tools/jetbrains.com/) | **Trains by default, you can opt out** | "Detailed code-related data can be used for product improvement and training AI models." For the free Non-commercial licence: "We may collect analytics as specified above by default based on our legitimate interest. You may opt out in the product settings." | [policy](https://www.jetbrains.com/legal/docs/terms/product_data_collection/) | 2026-10-28 |
| [Lovable](https://getpolicypeek.com/tools/lovable.dev/) | **Trains by default, you can opt out** | Trains on Customer Content; "You can opt out of model training at any time in your account settings, on any plan, at no cost". Business/Enterprise content is not trained on. | [policy](https://lovable.dev/privacy) | 2026-10-24 |
| [Bolt.new](https://getpolicypeek.com/tools/bolt.new/) | **Trains by default, you can opt out** | Bolt.new links to StackBlitz's policy: "Unless you opt out and subject to the regional and consent rules below, we may use Bolt Model Development Content ... to train, fine-tune, evaluate, benchmark, and improve artificial-intelligence models developed by or for StackBlitz." | [policy](https://stackblitz.com/privacy-policy) | 2026-10-28 |
| [Base44](https://getpolicypeek.com/tools/base44.com/) | **Trains on your data, no opt-out** | Terms licence Customer Data and Generated Output "for the purpose of maintaining, providing and improving the Platform", including to "(5) train Company software tools (e.g. artificial intelligence and machine learning models)"; no training opt-out. | [policy](https://base44.com/terms-of-service) | 2026-10-24 |
| [GitHub Copilot](https://getpolicypeek.com/tools/github.com/) | **Trains by default, you can opt out** | Rated on Copilot Free, Pro and Pro+: from 24 April 2026 GitHub uses "interaction data—specifically inputs, outputs, code snippets, and associated context ... to train and improve our AI models unless you opt out". Business and Enterprise aren't affected. | [GitHub changelog](https://github.blog/changelog/2026-03-25-updates-to-our-privacy-statement-and-terms-of-service-how-we-use-your-data/) | 2026-10-24 |
| [Amazon Q Developer](https://getpolicypeek.com/tools/amazon.com/) | **Company-wide policy** | Policy text is shared across multiple company products — not verified as specific to this tool. | [policy](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/service-improvement.html) | 2026-10-16 |
| [v0](https://getpolicypeek.com/tools/vercel.com/) | **Company-wide policy** | Company-wide policy, not product-verified — the only available source is Vercel's general Privacy Notice, which was never scoped to v0 specifically and has no v0-specific policy text to verify facts against. | [policy](https://vercel.com/legal/privacy-notice) | 2026-09-01 |

## Why aren't Cursor and Windsurf rated?

Both are under review. Cursor's [data-use page](https://cursor.com/data-use) says "If you choose to turn off 'Privacy Mode': we may use and store codebase data, prompts, editor actions, code snippets, and other code data and actions to improve our AI features and train our models." Its [privacy policy](https://cursor.com/privacy) says "We do not use Inputs or Suggestions to train our models, or permit third parties to use them for training, unless:" Neither page says whether Privacy Mode is on or off by default for free users, so PolicyPeek has taken the verdict down until it can. Windsurf's policy links now redirect to other companies' sites (docs.devin.ai and cognition.com), so PolicyPeek is re-checking which policy applies.

## Does Bolt.new train on UK users?

No. StackBlitz's policy, which Bolt.new links to, says: "We do not use Bolt Model Development Content, including Forge Content, associated with an account we determine to be located in the European Economic Area, the United Kingdom, or Switzerland for AI model development or for preparing datasets for licensing". Elsewhere, training applies "Unless you opt out". ([Bolt.new](https://getpolicypeek.com/tools/bolt.new/), [policy](https://stackblitz.com/privacy-policy))

## What about GitHub Copilot, Amazon Q and v0?

Since 24 April 2026 GitHub trains on Copilot Free, Pro and Pro+ interaction data unless you opt out in your GitHub settings under "Privacy"; GitHub says "Copilot Business and Copilot Enterprise users are not affected by this update." PolicyPeek rates it "Trains by default, you can opt out". Amazon Q Developer and v0 only have company-wide policies, so PolicyPeek doesn't give them a product verdict.

## How PolicyPeek decides

An AI model extracts the facts from the company's own policy, then fixed rules pick the badge. Uncertain results are held for human review. Each tool page links the exact policy it used and the date it was checked. ([Methodology](https://getpolicypeek.com/about/))


## Changes

- 28 October 2026: Cursor and Windsurf taken down for review (Cursor: the free-tier Privacy Mode default isn't stated; Windsurf: policy links redirect off-domain). JetBrains and Bolt.new quotes replaced with word-for-word text.

## FAQ

### Does Cursor train on my code?

Cursor's data-use page says training happens if you turn off Privacy Mode: "If you choose to turn off 'Privacy Mode': we may use and store codebase data, prompts, editor actions, code snippets, and other code data and actions to improve our AI features and train our models." PolicyPeek's verdict is under review because Cursor doesn't say whether Privacy Mode is on by default for free users.

### Does Tabnine train on my code?

No. Tabnine says it has a 'no-train-no-retain' policy and does not train on your code.

### Does Base44 train on my app data?

Base44's terms licence customer data and generated output to, among other things, train its AI and machine learning tools. PolicyPeek found no opt-out.

### Does Lovable train on my projects?

By default, yes, but Lovable says you can opt out in account settings on any plan at no cost, and Business and Enterprise content isn't trained on.

### Does GitHub Copilot train on my code?

On Free, Pro and Pro+, yes by default since 24 April 2026, unless you opt out in GitHub settings under "Privacy". GitHub says Business and Enterprise users aren't affected.
