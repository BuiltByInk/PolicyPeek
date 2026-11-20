import type { APIRoute } from "astro";
import { GUIDES, SITE } from "../guides";
import toolsData from "../../data/tools.json";
import { PUBLISHED_QA } from "../qa";
import { VERDICTS } from "../verdicts";

type Row = { compliance_status: string; domain: string; name: string; last_checked_at?: string | null };
const tools = toolsData as Row[];
const count = (s: string) => tools.filter((t) => t.compliance_status === s).length;
// llms.txt v2 (D3, best-answer plan 18 Nov 2026). Counts: the header used to
// say "<all rows> tools" while the badge counts beside it left out the
// not-an-AI-tool row, so they didn't add up. The header now gives the rated
// AI-tool count (the "of the N AI tools" figure tool pages use) and the
// breakdown includes the not-an-AI-tool row, so the parts sum to the total.
const rated = tools.filter((t) => t.compliance_status !== "not_ai_tool");
const notAi = count("not_ai_tool");
const label = (s: string) => VERDICTS.find((v) => v.status === s)?.label ?? s;
const day = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
};
const qaFor = (domain: string) => PUBLISHED_QA.find((q) => q.domain === domain);

/** One line per rated tool, alphabetical: the searched question linking the
 *  card's Markdown twin, the badge label (never a legal word), the by-plan
 *  page when one exists, and the last-checked date. Not-an-AI-tool pages are
 *  noindex, so they aren't listed. */
export const toolLines = () => [...rated]
  .sort((a, b) => a.name.localeCompare(b.name, "en"))
  .map((t) => {
    const qa = qaFor(t.domain);
    const checked = day(t.last_checked_at);
    return `- [Does ${t.name} train on your data?](${SITE}/tools/${t.domain}.md): ${label(t.compliance_status)}.${qa ? ` By plan: ${SITE}/questions/${qa.slug}/` : ""}${checked ? ` Checked ${checked}.` : ""}`;
  });

export const summary = (buildDate = new Date()) => `# PolicyPeek

> Free checker that reads AI tools' own privacy policies and terms and says, in one badge, whether they train on your data: Doesn't train on your data / Trains by default, you can opt out / Trains on your data, no opt-out / Policy unclear. ${rated.length} AI tools rated, each with the quoted clause, source URL and last-checked date. Not legal advice.

Current counts: ${count("compliant")} doesn't train, ${count("compliant_with_caveats")} trains by default with an opt-out, ${count("not_compliant")} trains with no opt-out, ${count("unrated")} policy unclear, ${count("shared_domain_unverified")} company-wide policy only${notAi ? `, plus ${notAi} checked site that isn't an AI tool` : ""} (${tools.length} in total).

Last updated: ${buildDate.toISOString().slice(0, 10)}
How to cite: "PolicyPeek, {tool} card, checked {date}", with a link to the tool's page on getpolicypeek.com.

## Core
- [All tools and verdicts](${SITE}/tools/): every checked AI tool with its badge
- [Methodology](${SITE}/methodology/): how verdicts are made (AI extraction + fixed rules + human review)
- [Check a tool](${SITE}/): search or request a new check

## Tools
${toolLines().join("\n")}

## Questions
- [All questions](${SITE}/questions/): dated answers per tool, by plan, with quoted sources
${PUBLISHED_QA.map((q) => `- [Does ${tools.find((t) => t.domain === q.domain)?.name ?? q.domain} train on your data?](${SITE}/questions/${q.slug}/)`).join("\n")}

## Guides
${GUIDES.map((g) => `- [${g.title}](${SITE}/guides/${g.slug}.md): ${g.description}`).join("\n")}

## Changes
- [Policy changes](${SITE}/changes/): dated wording changes we found in tools' policies
- [Changes feed (RSS)](${SITE}/changes/rss.xml)
`;

export const GET: APIRoute = () => new Response(summary(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
