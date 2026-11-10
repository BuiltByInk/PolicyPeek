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
  // Steward note, 9 Nov 2026 factcheck: workspace-level opt-out; up to 30 days.
  // Backed by the help-article quotes in the catalog row (not the privacy-policy
  // public-web-data training sentence).
  "intercom.com": {
    faq: [
      { q: "Can I stop Intercom Fin training on my data?", a: "Yes. An admin can request an opt-out in Settings > Workspace > Security > AI model training and fine-tuning. Intercom says it processes opt-out requests within 30 days. Until then, Fin CX models train by default on de-identified Fin conversation logs (with listed exclusions such as EU/AU regional hosting and trial accounts)." },
    ],
  },
  // Steward card wording, 10 Nov 2026 factcheck: opt-out is account holder
  // (the business) only, per subdomain, via support. End users who email a
  // company's Zendesk helpdesk cannot opt out themselves. Backed by the
  // Supplemental Terms and AI Data Use quotes in the catalog row.
  "zendesk.com": {
    faq: [
      { q: "Can I stop Zendesk AI training on my data?", a: "Yes, but only the Zendesk account holder (the business) can, per subdomain, by contacting Zendesk customer support. People who email a company's Zendesk helpdesk can't opt out themselves. Training is on Zendesk's own non-generative models by default; Zendesk says third-party generative LLMs don't train on the data." },
    ],
  },
  // Steward-approved Research card wording, 10 Nov 2026: support-only
  // opt-out for Free/Pro; Enterprise is carved out.
  "meshy.ai": {
    faq: [
      { q: "Can I stop Meshy training on my data?", a: "Yes, by emailing support@meshy.ai. Training is on for Free/Pro unless you email support. Enterprise is not trained on under this clause, unless otherwise agreed in the Order. The opt-out is by email, not an in-product setting." },
    ],
  },
  // Steward 10 Nov 2026: clause 4.7.4 is a support-only revocation on a
  // default-on licence; it may not reach usage or aggregated data.
  "kling.ai": {
    faq: [
      { q: "Can I stop Kling AI training on my data?", a: "Yes, by emailing support@kling.ai to revoke the authorization. That is a support-only revocation on a default-on licence. The revocation may not reach usage or aggregated data." },
    ],
  },
};

export const overrideFor = (domain: string): ToolOverride | undefined => TOOL_OVERRIDES[domain];
