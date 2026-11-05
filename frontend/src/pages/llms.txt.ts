import type { APIRoute } from "astro";
import { GUIDES, SITE } from "../guides";
import toolsData from "../../data/tools.json";
import { PUBLISHED_QA } from "../qa";

const tools = toolsData as { compliance_status: string; domain: string; name: string }[];
const count = (s: string) => tools.filter((t) => t.compliance_status === s).length;

export const summary = () => `# PolicyPeek

> Free checker that reads AI tools' own privacy policies and terms and says, in one badge, whether they train on your data: Doesn't train on your data / Trains by default, you can opt out / Trains on your data, no opt-out / Policy unclear. ${tools.length} tools, each with the quoted clause, source URL and last-checked date. Not legal advice.

Current counts: ${count("compliant")} doesn't train, ${count("compliant_with_caveats")} trains by default with an opt-out, ${count("not_compliant")} trains with no opt-out, ${count("unrated")} policy unclear, ${count("shared_domain_unverified")} company-wide policy only.

## Core
- [All tools and verdicts](${SITE}/tools/): every checked AI tool with its badge
- [Methodology](${SITE}/about/): how verdicts are made (AI extraction + fixed rules + human review)
- [Check a tool](${SITE}/): search or request a new check
- [Business resources](${SITE}/policy-pack/): separate paid AI policy templates for UK small businesses by InkLLM (not part of the ratings)

## Questions
- [All questions](${SITE}/questions/): dated answers per tool, by plan, with quoted sources
${PUBLISHED_QA.map((q) => `- [Does ${tools.find((t) => t.domain === q.domain)?.name ?? q.domain} train on your data?](${SITE}/questions/${q.slug}/)`).join("\n")}

## Guides
${GUIDES.map((g) => `- [${g.title}](${SITE}/guides/${g.slug}.md): ${g.description}`).join("\n")}
`;

export const GET: APIRoute = () => new Response(summary(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
