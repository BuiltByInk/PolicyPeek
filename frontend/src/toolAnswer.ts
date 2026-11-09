// Answer-engine layout for /tools/<domain>/ (AEO, 2026-11-09).
//
// STRICT SOURCING RULE, same as toolSummary.ts / toolFaq.ts: everything here
// is built ONLY from the tool's catalog row in data/tools.json. The answer
// line is a fixed phrasing per compliance_status (never generated); any
// "<Tool>'s published policy says ..." wording is used only when the row has
// a stored policy quote (`summary`), otherwise a neutral badge-based line is
// used. Quotes shown here are cut out of `summary` verbatim -- never
// paraphrased -- and a section or FAQ is skipped when the data can't support it.
import type { Tool } from "./types";
import { VERDICTS } from "./verdicts";
import { overrideFor } from "./toolOverrides";

export const ICO_AI_GUIDANCE = "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/";

const hasQuote = (t: Tool) => Boolean(t.summary && t.summary.trim());
const label = (t: Tool) => VERDICTS.find((v) => v.status === t.compliance_status)?.label ?? t.compliance_status;

/** The direct answer under the H1: a steward-approved per-tool override
 *  (toolOverrides.ts) when one exists, else the fixed wording per status. */
export function answerLine(tool: Tool): string {
  return overrideFor(tool.domain)?.answer ?? fixedAnswerLine(tool);
}

/** Deterministic: status -> fixed wording. */
export function fixedAnswerLine(tool: Tool): string {
  const n = tool.name;
  if (hasQuote(tool)) {
    switch (tool.compliance_status) {
      case "compliant": return `No. ${n}'s published policy says it doesn't train on your data by default.`;
      case "compliant_with_caveats": return `Yes, by default. ${n}'s published policy says it may train on your data, but you can opt out.`;
      case "not_compliant": return `Yes. ${n}'s published policy says it may train on your data, and we found no way to opt out.`;
      default: break;
    }
  } else {
    // No stored quote: say what the badge is, not what the policy "says".
    switch (tool.compliance_status) {
      case "compliant": return `No. PolicyPeek's badge for ${n} is "${label(tool)}".`;
      case "compliant_with_caveats": return `Yes, by default, with an opt-out. PolicyPeek's badge for ${n} is "${label(tool)}".`;
      case "not_compliant": return `Yes, with no opt-out found. PolicyPeek's badge for ${n} is "${label(tool)}".`;
      default: break;
    }
  }
  switch (tool.compliance_status) {
    case "unrated": return `We can't tell. ${n}'s published policy doesn't clearly say.`;
    case "shared_domain_unverified": return `We can't say yet. The only policy we found covers the whole company, not ${n} itself.`;
    case "not_ai_tool": return `Not applicable. Nothing in the policy we found suggests ${n} is an AI product.`;
    default: return `See PolicyPeek's badge for ${n}: "${label(tool)}".`;
  }
}

/** "28 October 2026" (UTC) or null. */
export function checkedDate(tool: Tool): string | null {
  const d = tool.last_checked_at ? new Date(tool.last_checked_at) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
}

/** First http(s) source with a short host label, or null. */
export function primarySource(tool: Tool): { href: string; host: string } | null {
  for (const raw of tool.source_urls) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") return { href: u.href, host: u.hostname.replace(/^www\./, "") };
    } catch { /* skip */ }
  }
  return null;
}

/** "As of 28 October 2026. Source: notion.com." -- the same plain text is used
 *  on the page and in JSON-LD, so the two can't drift. */
export function asOfText(tool: Tool): string {
  const d = checkedDate(tool), s = primarySource(tool);
  return [d ? `As of ${d}.` : "", s ? `Source: ${s.host}.` : ""].filter(Boolean).join(" ");
}

/** The stored policy wording split into verbatim pieces: the quoted strings
 *  when the summary uses quotes, otherwise its sentences. */
export function quoteParts(tool: Tool): string[] {
  const s = tool.summary?.trim();
  if (!s) return [];
  const quoted = [...s.matchAll(/"([^"]{12,})"/g)].map((m) => m[1].trim());
  if (quoted.length) return quoted;
  return s.split(/(?<=[.!?])\s+(?=["A-Z])/).map((x) => x.trim()).filter(Boolean);
}

const OPT_OUT = /\bopt(?:ed|s|ing)?[ -]?out\b|\bturn(?:ed)? off\b|\bswitch(?:ed)? off\b|\btoggle\b|\bdisable\b|\bsettings\b/i;
const TRAINING = /\btrain\w*|\bmodels?\b|\bfine-tun\w*/i;

/** "How to opt out": only for opt-out-able verdicts, with the stored wording
 *  that mentions the opt-out. `quotes` empty means "see the source". */
export function optOut(tool: Tool): { quotes: string[] } | null {
  if (tool.compliance_status !== "compliant_with_caveats") return null;
  return { quotes: quoteParts(tool).filter((q) => OPT_OUT.test(q)) };
}

const q = (parts: string[]) => parts.map((p) => `"${p.replace(/^"|"$/g, "")}"`).join(" ");

/** Generic answer-engine questions, answered only where the tool's stored
 *  wording addresses them (otherwise the question is skipped). */
export function genericFaq(tool: Tool): { q: string; a: string }[] {
  if (tool.compliance_status === "not_ai_tool") return [];
  const n = tool.name, parts = quoteParts(tool), out: { q: string; a: string }[] = [];
  const plan = parts.filter((p) => /\b(free|paid|enterprise|consumer|plans?|tiers?)\b/i.test(p) && TRAINING.test(p));
  if (plan.length) out.push({ q: "Do free AI tools use my data for training?", a: `It depends on the tool, and sometimes on the plan. For ${n}, the policy wording PolicyPeek recorded mentions plans: ${q(plan)}` });
  const del = parts.filter((p) => /\bdelet\w*/i.test(p) && TRAINING.test(p));
  if (del.length) out.push({ q: "Does deleting my chat history stop training?", a: `For ${n}, the policy wording PolicyPeek recorded says: ${q(del)}` });
  const up = parts.filter((p) => /\b(upload\w*|files?|documents?|attachments?)\b/i.test(p) && TRAINING.test(p));
  if (up.length) out.push({ q: "If I upload documents, are they used for training?", a: `For ${n}, the policy wording PolicyPeek recorded says: ${q(up)} PolicyPeek's badge: "${label(tool)}".` });
  return out;
}
