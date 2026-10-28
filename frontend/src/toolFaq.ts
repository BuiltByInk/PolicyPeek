// Extra Q&A for each tool page (SEO follow-up, 2026-11-04: meshy, kimi,
// invideo, elevenlabs, bolt and other thin pages). Built ONLY from the tool's
// catalog row in data/tools.json and the catalog as a whole -- no outside facts.
import type { Tool } from "./types";
import { VERDICTS } from "./verdicts";

export interface Faq { q: string; a: string }

export function toolFaq(tool: Tool, all: Tool[]): Faq[] {
  if (tool.compliance_status === "not_ai_tool") return [];
  const n = tool.name;
  const out: Faq[] = [];
  const optOut: Record<string, string> = {
    compliant: `There is nothing to opt out of: ${n}'s published policy says it doesn't use your data to train AI models by default.`,
    compliant_with_caveats: `Yes. ${n}'s published policy says it may train on your data by default but describes a way to opt out. The policy wording PolicyPeek recorded is shown above.`,
    not_compliant: `PolicyPeek found no opt-out. ${n}'s published policy allows training on your data, and no setting to stop it was found.`,
    unrated: `${n}'s published policy doesn't clearly say whether your data is used for training, so PolicyPeek can't say whether an opt-out exists.`,
    shared_domain_unverified: `The only policy found covers the whole company, so PolicyPeek can't say whether ${n} itself offers an opt-out.`,
  };
  if (optOut[tool.compliance_status]) out.push({ q: `Can I stop ${n} training on my data?`, a: optOut[tool.compliance_status] });

  const ret = tool.data_retention?.trim().replace(/\s+/g, " ");
  out.push({
    q: `How long does ${n} keep my data?`,
    a: ret ? `${n}'s policy says: ${/[.!?]$/.test(ret) ? ret : ret + "."}` : `${n}'s published policy, as read by PolicyPeek, doesn't state how long your data is kept.`,
  });

  out.push({
    q: `Does ${n}'s policy mention GDPR?`,
    a: tool.gdpr_mentioned === true ? `Yes, ${n}'s published policy mentions GDPR.`
      : tool.gdpr_mentioned === false ? `No, ${n}'s published policy doesn't mention GDPR.`
      : `PolicyPeek hasn't recorded whether ${n}'s policy mentions GDPR.`,
  });

  const rated = all.filter((t) => t.compliance_status !== "not_ai_tool");
  const same = rated.filter((t) => t.compliance_status === tool.compliance_status).length;
  const v = VERDICTS.find((x) => x.status === tool.compliance_status);
  if (v) out.push({ q: `How does ${n} compare with other AI tools?`, a: `${same} of the ${rated.length} AI tools PolicyPeek lists share ${n}'s badge, "${v.label}". See the related tools below or browse all tools.` });
  return out;
}

// Clamp text to max characters at a word boundary (meta descriptions).
export function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/[\s,;:.]+\S*$/, "") + "…";
}

// Tool <title> (Layout appends " · PolicyPeek", 13 chars) kept to 60 total.
export const TITLE_SUFFIX = " · PolicyPeek";
export function toolTitle(name: string, max = 60 - TITLE_SUFFIX.length): string {
  for (const t of [`Does ${name} train on your data?`, `Does ${name} train on data?`, `${name}: AI training policy`, `${name}: AI training`]) if (t.length <= max) return t;
  return clamp(name, max);
}

