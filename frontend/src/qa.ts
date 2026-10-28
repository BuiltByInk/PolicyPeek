// Dated Q&A pages ("Does X train on your data?") at /questions/<slug>/.
//
// STRICT SOURCING RULE: every policy quote here is copied word for word from a
// page snapshot saved under research/qa-sources/<fetched>/ (the test suite
// checks each quote against its snapshot), or from the verified catalog
// (data/tools.json). Anything a source doesn't say is written as
// NOT_STATED, never filled in. The verdict itself always comes from the catalog.
//
// `draft: true` keeps a page out of the build, the /questions/ index, the
// sitemap and llms.txt (used while a verdict is being re-checked).

export const NOT_STATED = "Not stated in policy";

export interface QaSource { id: string; url: string; title: string; fetched: string; snapshot: string }
/** A word-for-word quote. `src: "catalog"` means the tool's verified catalog entry. */
export interface Quote { text: string; src: string }
export interface PlanRow { plan: string; training: Quote | null; retention: Quote | null }
export interface QaEntry {
  slug: string;
  domain: string;
  draft?: boolean;
  /** Date the sources below were fetched and the page reviewed (YYYY-MM-DD). */
  reviewed: string;
  sources: QaSource[];
  plans: PlanRow[];
  dataUsed: Quote[];
  retention: Quote[];
  /** Ordered opt-out steps; empty when there is nothing to opt out of. */
  optOutSteps: Quote[];
  optOutCaveats: Quote[];
  gdpr: Quote[];
  changelog: { date: string; text: string }[];
}

const SNAP = "research/qa-sources/2026-10-28";

export const QA_PAGES: QaEntry[] = [
  {
    slug: "does-claude-train-on-your-data",
    domain: "claude.com",
    reviewed: "2026-10-28",
    sources: [
      { id: "anthropic-privacy", url: "https://www.anthropic.com/legal/privacy", title: "Anthropic Privacy Policy (shown as effective Sep 10, 2026)", fetched: "2026-10-28", snapshot: `${SNAP}/anthropic-privacy.txt` },
    ],
    plans: [
      {
        plan: "Free, Pro, Max (consumer)",
        training: { text: "Consumer plans (Free, Pro, Max): We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings.", src: "catalog" },
        retention: { text: "Anthropic retains your personal data for as long as reasonably necessary for the purposes and criteria outlined in this Privacy Policy", src: "anthropic-privacy" },
      },
      {
        plan: "Commercial plans",
        training: { text: "Commercial plans don't train by default.", src: "catalog" },
        retention: null,
      },
      {
        plan: "Enterprise",
        training: { text: "This Privacy Policy does not apply to content that we process on behalf of customers of our business offerings, such as our Enterprise accounts. Our use of that data is governed by our customer agreements covering access to and use of those offerings.", src: "anthropic-privacy" },
        retention: null,
      },
    ],
    dataUsed: [
      { text: "Data that our users or crowd workers provide, including Inputs and Outputs from our Services (unless users opt out)", src: "anthropic-privacy" },
      { text: "Feedback that users explicitly provide about our Services", src: "anthropic-privacy" },
      { text: "If you rate an Output in response to an Input—for example, by using the thumbs up/thumbs down icon—we may store the entire related conversation as part of your Feedback.", src: "anthropic-privacy" },
    ],
    retention: [
      { text: "You also are able to delete individual conversations, which will be removed immediately from your conversation history and automatically deleted from our back-end within 30 days.", src: "anthropic-privacy" },
      { text: "Feedback data stored for up to 5 years in secured back-end", src: "catalog" },
    ],
    optOutSteps: [
      { text: "Anthropic gives you access to a variety of tools to help you manage your data. You can access these in your Privacy Settings.", src: "anthropic-privacy" },
      { text: "We may use your Inputs and Outputs to train and improve Anthropic AI models, unless you opt out through your account settings.", src: "anthropic-privacy" },
    ],
    optOutCaveats: [
      { text: "Even if you opt-out, we will use Inputs and Outputs for model improvement when: (i) your conversations are flagged for safety review to improve our ability to detect harmful content, enforce our policies, or advance AI safety research, or (ii) you've explicitly reported the materials to us (for example via our feedback mechanisms).", src: "anthropic-privacy" },
    ],
    gdpr: [
      { text: "If you live in the European Economic Area (EEA), UK or Switzerland (the \"European Region\"), the data controller responsible for your personal data is Anthropic Ireland, Limited.", src: "anthropic-privacy" },
      { text: "where the EU GDPR or UK GDPR applies, we will respond within one calendar month of receiving a verifiable request", src: "anthropic-privacy" },
      { text: "If you live or work in the UK, you have the right to lodge a complaint with the UK Information Commissioner's Office.", src: "anthropic-privacy" },
    ],
    changelog: [
      { date: "2026-10-15", text: "Verdict checked against Anthropic's privacy policy: trains by default, you can opt out." },
      { date: "2026-10-28", text: "Q&A page published from the catalog verdict; privacy policy re-read for plan, retention, opt-out and UK GDPR quotes." },
    ],
  },
  {
    slug: "does-notion-ai-train-on-your-data",
    domain: "notion.com",
    reviewed: "2026-10-28",
    sources: [
      { id: "notion-ai-security", url: "https://www.notion.com/help/notion-ai-security-practices", title: "Notion AI security & privacy practices (Notion Help, no date shown)", fetched: "2026-10-28", snapshot: `${SNAP}/notion-ai-security-practices.txt` },
    ],
    plans: [
      {
        plan: "Free, Plus, Business",
        training: { text: "By default, neither Notion nor our AI providers use your Customer Data to train any models.", src: "notion-ai-security" },
        retention: { text: "Free, Plus, and Business: AI provider retains your data for 30 days or fewer, then deletes it.", src: "notion-ai-security" },
      },
      {
        plan: "Enterprise",
        training: { text: "By default, neither Notion nor our AI providers use your Customer Data to train any models.", src: "notion-ai-security" },
        retention: { text: "Most models we use offer zero data retention (ZDR), meaning they process your data only to generate a response and keep nothing afterward.", src: "notion-ai-security" },
      },
    ],
    dataUsed: [
      { text: "Permissions are respected: Notion AI can only ever use content you give it access to.", src: "notion-ai-security" },
      { text: "Those relevant pages and your request are sent to the LLMs, which generate the answer.", src: "notion-ai-security" },
      { text: "Notion generates an embedding for each page using zero-retention LLMs.", src: "notion-ai-security" },
    ],
    retention: [
      { text: "A small number of models don't offer zero data retention. When you use one of those models, your data may be retained by the provider for a limited period solely to deliver the response. These models are off by default and the workspace owner must opt in to use these models.", src: "notion-ai-security" },
      { text: "Embeddings are deleted within 60 days of the page or workspace being deleted.", src: "notion-ai-security" },
    ],
    optOutSteps: [],
    optOutCaveats: [
      { text: "Our contracts with AI providers prohibit them from using your data to train their models, and your use of Notion AI grants Notion no right or license to use your data to train ours.", src: "notion-ai-security" },
    ],
    gdpr: [],
    changelog: [
      { date: "2026-10-15", text: "Verdict checked against Notion's AI security page: doesn't train on your data." },
      { date: "2026-10-28", text: "Q&A page published. Live page re-read: the training sentence now reads \"By default, neither Notion nor our AI providers use your Customer Data to train any models.\" The verdict is unchanged." },
    ],
  },
  {
    // HELD (28 Oct 2026): Research is re-checking Perplexity's opt-out. Not built,
    // not in the index, sitemap or llms.txt until the catalog verdict is settled.
    slug: "does-perplexity-ai-train-on-your-data",
    domain: "perplexity.ai",
    draft: true,
    reviewed: "2026-10-28",
    sources: [],
    plans: [],
    dataUsed: [],
    retention: [],
    optOutSteps: [],
    optOutCaveats: [],
    gdpr: [],
    changelog: [],
  },
];

export const PUBLISHED_QA = QA_PAGES.filter((q) => !q.draft);
export const qaForDomain = (domain: string) => PUBLISHED_QA.find((q) => q.domain === domain);
