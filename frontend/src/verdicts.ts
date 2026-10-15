// Shared verdict metadata for the home-page register, the /tools filter and
// the tool detail page. Badge.astro keeps its own label/class map (it is the
// canonical badge renderer, see the comments there); this file only adds the
// plain-language "what this means" line and the reason fallbacks, so a page
// never has to invent wording of its own.
import type { Tool } from "./types";

export type Status = Tool["compliance_status"];

export interface VerdictInfo {
  status: Status;
  /** Full badge label. Badge.astro and the tool-page verdict block both render this exact string. */
  label: string;
  /** Short label for filter chips / register rows. */
  short: string;
  /** One plain sentence. Mirrors the methodology page. */
  meaning: string;
  /** CSS custom-property prefix used for the swatch colour. */
  swatch: string;
}

// Order = how a visitor scanning for trouble wants to read them.
export const VERDICTS: VerdictInfo[] = [
  { status: "not_compliant", label: "Trains on your data, no opt-out", short: "No opt-out", swatch: "red",
    meaning: "Their published policy says your data may be used for training, and we found no way to opt out." },
  { status: "compliant_with_caveats", label: "Trains by default, you can opt out", short: "Opt-out available", swatch: "caveat",
    meaning: "Their published policy says your data may be used for training unless you switch it off." },
  { status: "unrated", label: "Policy unclear", short: "Unclear", swatch: "amber",
    meaning: "Their published policy doesn't clearly say whether your data is used for training." },
  { status: "shared_domain_unverified", label: "Company-wide policy", short: "Company-wide policy", swatch: "amber",
    meaning: "The only policy we found covers the whole company, not this product, so we can't give a product verdict yet." },
  { status: "compliant", label: "Doesn't train on your data", short: "Doesn't train", swatch: "green",
    meaning: "Their published policy says your data isn't used to train AI models, or only if you choose to opt in." },
  { status: "not_ai_tool", label: "Not an AI tool", short: "Not an AI tool", swatch: "gray",
    meaning: "Nothing in this site's policy suggests it's an AI product, so the training question doesn't apply." },
];

export const NOT_AI_TOOL_REASON =
  "PolicyPeek's training check doesn't apply here: the policy we found shows no sign this is an AI product.";

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
      return summary ?? "Their published policy says your data may be used for training, and we found no way to opt out.";
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
