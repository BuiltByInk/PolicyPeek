// Optional per-tool wording overrides for /tools/<domain>/ (2026-11-09).
//
// Used ONLY when present; every other tool gets the fixed per-status wording
// from toolAnswer.ts / toolFaq.ts. Kept here rather than in data/tools.json
// because tools.json is regenerated from D1 (scripts/generate-tools-json.mjs)
// and extra fields would be dropped on the next refresh.
//
// RULE: an override may only restate what the tool's stored, verbatim quotes
// (tools.json `summary`) already say, and must be steward-approved. It never
// changes the verdict or badge.
export interface ToolOverride {
  /** Replaces the fixed answer line under the H1 (and the H1's FAQPage answer). */
  answer?: string;
  /** Replaces the generated FAQ with the same question, or is added if new. */
  faq?: { q: string; a: string }[];
}

export const TOOL_OVERRIDES: Record<string, ToolOverride> = {
  // Steward-approved wording, 9 Nov 2026. Backed by the privacy-principles
  // quotes in the catalog row (predictive models on by default, owner opt-out
  // via feedback@slack.com, generative training only with opt-in).
  "slack.com": {
    answer: "Yes, by default, for recommendation features only. Slack says it analyses your messages, content and files to train its non-generative recommendation models (like emoji and channel suggestions) unless a workspace owner opts out. It says it doesn't train generative AI or LLMs on your data unless you opt in.",
    faq: [
      { q: "Can I stop Slack AI training on my data?", a: "Yes, but only a workspace owner can. They email feedback@slack.com to opt the workspace out of Slack's global recommendation models. Generative AI training only happens if your organisation opts in." },
    ],
  },
};

export const overrideFor = (domain: string): ToolOverride | undefined => TOOL_OVERRIDES[domain];
