import type { APIRoute } from "astro";
import { GUIDES } from "../../guides";

export function getStaticPaths() {
  return GUIDES.map((g) => ({ params: { slug: g.slug }, props: { markdown: g.markdown } }));
}

// The clean Markdown source of each guide, byte-for-byte what the HTML page is built from.
export const GET: APIRoute = ({ props }) =>
  new Response(props.markdown as string, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
