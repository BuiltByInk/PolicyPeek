import type { APIRoute } from "astro";
import rows from "../../../data/policy-changes.json";
import { publishedChanges, type PolicyChange } from "../../policyChanges";

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const GET: APIRoute = () => {
  const changes = publishedChanges(rows as PolicyChange[]);
  const items = changes.map((c) => {
    const link = `https://getpolicypeek.com/tools/${c.toolDomain}/`;
    const pub = `${c.date}T00:00:00Z`;
    return `    <item>
      <title>${xml(`${c.toolName}: policy text changed`)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="false">${xml(c.id)}</guid>
      <pubDate>${new Date(pub).toUTCString()}</pubDate>
      <description>${xml(c.summary)}</description>
    </item>`;
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>PolicyPeek policy changes</title>
    <link>https://getpolicypeek.com/changes/</link>
    <description>Real policy-text changes found when PolicyPeek re-reads a vendor's own published page.</description>
    <language>en-gb</language>
    <atom:link href="https://getpolicypeek.com/changes/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
};
