// Dated Q&A pages ("Does X train AI on your data?"). Every fact comes from
// data/tools.json (generated from D1). `optOutQuote` must be a verbatim
// substring of the tool's catalog summary -- tests enforce this so the page
// never says more than the verified catalog entry.
export interface QaEntry { slug: string; domain: string; optOutQuote: string | null }
export const QA_PAGES: QaEntry[] = [
  { slug: "does-claude-train-ai-on-your-data", domain: "claude.com", optOutQuote: "unless you opt out through your account settings" },
  { slug: "does-notion-ai-train-ai-on-your-data", domain: "notion.com", optOutQuote: null },
  { slug: "does-perplexity-ai-train-ai-on-your-data", domain: "perplexity.ai", optOutQuote: "The only opt-outs it describes are for targeted advertising, not training." },
];
