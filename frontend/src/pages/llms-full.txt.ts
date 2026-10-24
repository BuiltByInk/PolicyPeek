import type { APIRoute } from "astro";
import { GUIDES, SITE } from "../guides";
import { summary } from "./llms.txt";

// llms.txt plus the full Markdown of every guide, for agents that want it in one fetch.
export const GET: APIRoute = () =>
  new Response(
    summary() + "\n" + GUIDES.map((g) => `---\nSource: ${SITE}/guides/${g.slug}/\n\n${g.markdown.trim()}\n`).join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
