// Shared verdict metadata for the home-page register, the /tools filter and
// the tool detail page. Badge.astro keeps its own label/class map (it is the
// canonical badge renderer, see the comments there); this file only adds the
// plain-language "what this means" line and the reason fallbacks, so a page
// never has to invent wording of its own.
import type { Tool } from "./types";

export type Status = Tool["compliance_status"];

export interface VerdictInfo {
  status: Status;
  /** Short label for filter chips / register rows (the full badge label lives in Badge.astro). */
  short: string;
  /** One plain sentence. Mirrors the methodology page. */
  meaning: string;
  /** CSS custom-property prefix used for the swatch colour. */
  swatch: string;
}

// Order = how a visitor scanning for trouble wants to read them.
export const VERDICTS: VerdictInfo[] = [
  { status: "not_compliant", short: "Not compliant", swatch: "red",
    meaning: "Trains on your data by default, with no opt-out." },
  { status: "compliant_with_caveats", short: "With caveats", swatch: "caveat",
    meaning: "Trains on your data by default, but the policy gives you a real way to opt out." },
  { status: "unrated", short: "Unrated", swatch: "amber",
    meaning: "The policy doesn't say clearly either way. We don't know." },
  { status: "shared_domain_unverified", short: "Company-wide policy", swatch: "amber",
    meaning: "The only policy we found covers a whole company, not this product." },
  { status: "compliant", short: "Compliant", swatch: "green",
    meaning: "Doesn't train on your data by default, or only if you opt in." },
  { status: "not_ai_tool", short: "Not an AI tool", swatch: "gray",
    meaning: "This doesn't look like an AI product, so the question doesn't apply." },
];

export const NOT_AI_TOOL_REASON =
  "PolicyPeek's compliance check doesn't apply here — the policy we found shows no sign this is an AI/ML product.";

export const SHARED_DOMAIN_REASON = (name: string) =>
  `Policy text is shared across multiple company products, so this badge doesn't reflect ${name}-specific data handling.`;

export const UNRATED_NO_SUMMARY_REASON =
  "The policy doesn't clearly say whether this tool trains on your data. Read the source below before you decide.";

/** Upper-case the first letter. Many stored summaries are verbatim policy
 *  fragments that start mid-sentence ("we may use Content…"). Purely
 *  presentational; the string is still escaped by Astro on render. */
export function sentence(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** The one-line reason shown next to a verdict. Amber and red must always
 *  have one (charter: never paywalled, never blank), so those statuses fall
 *  back to fixed wording when a tool has no summary of its own. Returns null
 *  only for statuses where blank is acceptable. */
export function reasonFor(tool: Tool): string | null {
  const summary = tool.summary && tool.summary.trim() ? sentence(tool.summary) : null;
  switch (tool.compliance_status) {
    case "not_ai_tool":
      // Fixed explanation, not tool.summary: for this status the summary is
      // just the first extracted quote (e.g. a comment-retention clause),
      // which reads as out-of-context without the "why".
      return NOT_AI_TOOL_REASON;
    case "shared_domain_unverified":
      return summary ?? SHARED_DOMAIN_REASON(tool.name);
    case "unrated":
      return summary ?? UNRATED_NO_SUMMARY_REASON;
    case "not_compliant":
      return summary ?? "Trains on your data by default, with no opt-out.";
    default:
      return summary;
  }
}

/** Only http(s) URLs may become clickable links. source_urls are
 *  admin-approved but originate from user submissions, so a `javascript:` or
 *  `data:` value must never reach an href even though Astro escapes the
 *  attribute text. */
export function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
