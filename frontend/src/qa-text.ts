// Shared wording for the /questions/ pages and the /tools/ cross-links.
import type { Tool } from "./types";

export const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** One-sentence direct answer; same meaning as the /tools/ page answer for each verdict. */
export const qaAnswer = (t: Tool): string | null => ({
  compliant: `No: ${t.name}'s published policy says it doesn't train on your data by default.`,
  compliant_with_caveats: `Yes, by default: ${t.name}'s published policy says it may train on your data, but you can opt out.`,
  not_compliant: `Yes: ${t.name}'s published policy says it may train on your data, and we found no way to opt out.`,
} as Record<string, string>)[t.compliance_status] ?? null;

export const qaTitle = (t: Tool) => `Does ${t.name} train on your data? (Checked ${monYear(t.last_checked_at!)})`;
