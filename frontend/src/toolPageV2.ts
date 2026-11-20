// Tool-page template v2 (D1, Marketing's best-answer plan, 18 Nov 2026).
//
// Same STRICT SOURCING RULE as toolAnswer.ts / toolFaq.ts: everything here
// comes from the tool's catalog row, the published /questions/ data (qa.ts),
// steward-approved overrides (toolOverrides.ts) or the committed
// first-published dates. Nothing is inferred; a block is hidden when its data
// is missing. Nothing here reads or changes the verdict, badge or quotes.
import type { Tool } from "./types";
import { qaForDomain, type QaEntry } from "./qa";
import { overrideFor } from "./toolOverrides";
import { quoteParts } from "./toolAnswer";
import { toolPath } from "./toolPaths.mjs";
import firstPublishedData from "../data/first-published.json";

export interface SourcedText { text: string; href: string }
export interface PlanTableRow { plan: string; training: SourcedText | null; retention: SourcedText | null }

const isHttp = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

/** "By plan" rows: the tool's /questions/ page rows when it has one, else
 *  steward-approved override rows, else none (the table is hidden). */
export function planTable(tool: Tool): { rows: PlanTableRow[]; from: "questions" | "override" } | null {
  const qa: QaEntry | undefined = qaForDomain(tool.domain);
  const toolUrl = toolPath(tool.domain);
  if (qa && qa.plans.length) {
    const src = (s: string) => (s === "catalog" ? toolUrl : qa.sources.find((x) => x.id === s)?.url ?? toolUrl);
    return { from: "questions", rows: qa.plans.map((p) => ({
      plan: p.plan,
      training: p.training ? { text: p.training.text, href: src(p.training.src) } : null,
      retention: p.retention ? { text: p.retention.text, href: src(p.retention.src) } : null,
    })) };
  }
  const o = overrideFor(tool.domain)?.plans ?? [];
  const rows = o.filter((p) => p.plan.trim()).map((p) => ({
    plan: p.plan,
    training: p.training && isHttp(p.training.src) ? { text: p.training.text, href: p.training.src } : null,
    retention: p.retention && isHttp(p.retention.src) ? { text: p.retention.text, href: p.retention.src } : null,
  }));
  return rows.length ? { from: "override", rows } : null;
}

/** Numbered opt-out steps (override `opt_out_steps`). Empty for every tool
 *  until Research's R4 data is approved, so nothing renders yet. Only for the
 *  opt-out verdict, and only steps with an http(s) source. */
export function optOutSteps(tool: Tool): SourcedText[] {
  if (tool.compliance_status !== "compliant_with_caveats") return [];
  return (overrideFor(tool.domain)?.opt_out_steps ?? [])
    .filter((s) => s.text.trim() && isHttp(s.src))
    .map((s) => ({ text: s.text.trim(), href: s.src }));
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The vendor's own "policy last updated" date, only when an override records it. */
export function policyUpdated(tool: Tool): { iso: string; text: string; href: string } | null {
  const p = overrideFor(tool.domain)?.policy_updated;
  if (!p || !ISO_DAY.test(p.date) || !isHttp(p.src) || Number.isNaN(new Date(`${p.date}T00:00:00Z`).getTime())) return null;
  return { iso: p.date, text: fmt(p.date), href: p.src };
}

/** First date the card appeared in the catalog on main (scripts/first-published.mjs), or null. */
export function firstPublished(tool: Tool): string | null {
  const d = (firstPublishedData as Record<string, string>)[tool.domain];
  return d && ISO_DAY.test(d) ? d : null;
}

/** JSON-LD additions for the tool's WebPage: datePublished, isBasedOn (the
 *  http(s) sources) and, only for human-reviewed cards, reviewedBy Elliot Inkley
 *  (Elliot approved the "Checked by Elliot Inkley" credit by email, 18 Nov 2026). */
export const REVIEWER_NAME = "Elliot Inkley";
const REVIEWER = { "@type": "Person", name: REVIEWER_NAME } as const;

export function jsonLdV2(tool: Tool, _siteUrl: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pub = firstPublished(tool);
  // A card can land on main a day after its last check (Freshdesk: checked 17
  // Nov, merged 18 Nov). datePublished after dateModified is invalid, so the
  // date is left out then rather than moved (never a guess).
  const checkedDay = typeof tool.last_checked_at === "string" && ISO_DAY.test(tool.last_checked_at.slice(0, 10)) ? tool.last_checked_at.slice(0, 10) : null;
  if (pub && !(checkedDay && pub > checkedDay)) out.datePublished = pub;
  const based = tool.source_urls.filter(isHttp);
  if (based.length) out.isBasedOn = based.length === 1 ? based[0] : based;
  if (!tool.auto_published) out.reviewedBy = REVIEWER;
  return out;
}

const TRAINING = /\btrain\w*|\bmodels?\b|\bfine-tun\w*/i;
const q = (parts: string[]) => parts.map((p) => `"${p.replace(/^"|"$/g, "")}"`).join(" ");

/** Tool-specific sub-questions people search for (plan, from autocomplete),
 *  added only when the stored wording addresses them, answered only with
 *  that wording. */
export function subQuestionFaq(tool: Tool): { q: string; a: string }[] {
  if (tool.compliance_status === "not_ai_tool") return [];
  const n = tool.name, parts = quoteParts(tool), out: { q: string; a: string }[] = [];
  const api = parts.filter((p) => /\bAPI\b/.test(p) && TRAINING.test(p));
  if (api.length) out.push({ q: `Does ${n} train on API data?`, a: `For ${n}, the policy wording PolicyPeek recorded says: ${q(api)}` });
  const biz = parts.filter((p) => /\b(business|enterprise|teams?|workspace|organi[sz]ation)\b/i.test(p) && TRAINING.test(p));
  if (biz.length) out.push({ q: `Does ${n} train on business or enterprise accounts?`, a: `It can depend on the plan. For ${n}, the policy wording PolicyPeek recorded says: ${q(biz)}` });
  return out;
}
