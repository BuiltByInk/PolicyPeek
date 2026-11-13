// Task 3 auto-publish gate (pure). A card change may auto-publish only if
// there is at least one quote, every first- and second-opinion quote is word-for-word in this run's fetched text, the
// verdict direction is unchanged, an independent second opinion agrees, and
// the tool is not on the held, recheck or medium-flag lists in file 02.
import { listHit, type ListHit } from "./heldLists";

export const VERDICT_DIRECTIONS = [
  "doesnt_train",
  "trains_opt_out",
  "trains_no_opt_out",
  "policy_unclear",
  "company_wide",
  "not_ai_tool",
] as const;
export type VerdictDirection = (typeof VERDICT_DIRECTIONS)[number];

/** The four badges named in the 13 Nov handoff, plus the two other live badges. */
export const FOUR_CORE_DIRECTIONS = [
  "doesnt_train",
  "trains_opt_out",
  "trains_no_opt_out",
  "policy_unclear",
] as const;

export type ComplianceStatus =
  | "compliant"
  | "compliant_with_caveats"
  | "not_compliant"
  | "unrated"
  | "shared_domain_unverified"
  | "not_ai_tool"
  | "held";

export function directionFromStatus(status: string): VerdictDirection {
  switch (status) {
    case "compliant":
      return "doesnt_train";
    case "compliant_with_caveats":
      return "trains_opt_out";
    case "not_compliant":
      return "trains_no_opt_out";
    case "shared_domain_unverified":
      return "company_wide";
    case "not_ai_tool":
      return "not_ai_tool";
    default:
      return "policy_unclear";
  }
}

export type GateFailReason =
  | "no_quotes"
  | "quote_not_verbatim"
  | "direction_changed"
  | "second_opinion_disagree"
  | "held"
  | "recheck"
  | "medium_flag";

export interface GateInput {
  toolSlug: string;
  fetchedText: string;
  oldDirection: VerdictDirection;
  newDirection: VerdictDirection;
  reliedOnQuotes: string[];
  /** Quotes from the independent second opinion; each must also appear verbatim. */
  secondQuotes?: string[];
  firstOpinion: VerdictDirection;
  secondOpinion: VerdictDirection;
}

export interface GateResult {
  publish: boolean;
  reasons: GateFailReason[];
  missingQuotes: string[];
  listHit: ListHit | null;
  directionChanged: boolean;
}

/** Collapse whitespace so a quote can still match across line wraps, but
 *  the words and punctuation must be identical. */
export function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function quoteAppearsVerbatim(quote: string, fetchedText: string): boolean {
  const q = quote.trim();
  if (!q) return false;
  if (fetchedText.includes(q)) return true;
  return collapseWs(fetchedText).includes(collapseWs(q));
}

export function missingQuotes(quotes: string[], fetchedText: string): string[] {
  return quotes.filter((q) => q.trim() && !quoteAppearsVerbatim(q, fetchedText));
}

export function evaluateChangeGate(input: GateInput): GateResult {
  const firstQuotes = (input.reliedOnQuotes ?? []).map((q) => q.trim()).filter(Boolean);
  const secondQuotes = (input.secondQuotes ?? []).map((q) => q.trim()).filter(Boolean);
  const missing = missingQuotes([...firstQuotes, ...secondQuotes], input.fetchedText);
  const directionChanged = input.oldDirection !== input.newDirection;
  const opinionsDisagree =
    input.firstOpinion !== input.secondOpinion || input.firstOpinion !== input.newDirection;
  const hit = listHit(input.toolSlug);

  const reasons: GateFailReason[] = [];
  if (firstQuotes.length === 0) reasons.push("no_quotes");
  if (missing.length) reasons.push("quote_not_verbatim");
  if (directionChanged) reasons.push("direction_changed");
  if (opinionsDisagree) reasons.push("second_opinion_disagree");
  if (hit) reasons.push(hit);

  return {
    publish: reasons.length === 0,
    reasons,
    missingQuotes: missing,
    listHit: hit,
    directionChanged,
  };
}
