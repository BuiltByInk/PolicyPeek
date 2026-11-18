// Tool page URLs (D4, Marketing's best-answer plan, 18 Nov 2026: several
// products per domain). Plain .mjs so astro.config.mjs, the Astro pages,
// scripts and tests all share one implementation.
//
// Every card keeps its URL /tools/<domain>/ (the catalog/D1 key), EXCEPT a
// card listed in data/products.json, which lives at /tools/<parent>/<slug>/
// (e.g. NotebookLM: { "notebooklm.google.com": { "parent": "google.com",
// "slug": "notebooklm" } } -> /tools/google.com/notebooklm/). Its old
// /tools/<domain>/ path gets a 301 to the new one (productRedirects, written
// to dist/_redirects at build). The registry is empty today, so no live URL
// changes.
//
// No D1 change: D1's tools.domain is UNIQUE, so each product still needs its
// own key. A product with its own host (notebooklm.google.com,
// photos.google.com, whatsapp.com) already fits; /v1/lookup picks the most
// specific host, so the extension gets the product card on that host and the
// company card on the apex. A product with NO host of its own would need the
// schema change described in the D4 PR (not done here).
import productsData from "../data/products.json" with { type: "json" };

const SITE = "https://getpolicypeek.com";
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// PP_PRODUCTS_TEST (JSON) replaces the registry for test builds only
// (tests/multi-product.test.mjs); never set in a real build or deploy.
export const loadProducts = () => (globalThis.process?.env?.PP_PRODUCTS_TEST ? JSON.parse(process.env.PP_PRODUCTS_TEST) : productsData.products ?? {});
const DEFAULT = loadProducts();

/** Problems with a registry against the catalog; [] means valid. The build fails on any. */
export function validateProducts(products, tools) {
  const problems = [];
  const domains = new Set(tools.map((t) => t.domain));
  const seen = new Map();
  for (const [key, p] of Object.entries(products)) {
    if (!domains.has(key)) problems.push(`${key}: not a catalog domain`);
    if (!p || !DOMAIN.test(p.parent ?? "")) problems.push(`${key}: parent must be a domain`);
    if (!SLUG.test(p?.slug ?? "")) problems.push(`${key}: slug must be lower-case words joined by hyphens`);
    if (p?.parent === key) problems.push(`${key}: parent can't be the product's own key`);
    if (DOMAIN.test(p?.slug ?? "")) problems.push(`${key}: slug looks like a domain`);
    if (products[p?.parent]) problems.push(`${key}: parent ${p.parent} is itself a product (one level only)`);
    const path = `${p?.parent}/${p?.slug}`;
    if (seen.has(path)) problems.push(`${key}: same URL as ${seen.get(path)}`);
    seen.set(path, key);
  }
  return problems;
}

/** Site-relative card URL, with trailing slash: /tools/openai.com/ */
export function toolPath(domain, products = DEFAULT) {
  const p = products[domain];
  return p ? `/tools/${p.parent}/${p.slug}/` : `/tools/${domain}/`;
}
/** Absolute card URL. */
export const toolUrl = (domain, products = DEFAULT) => `${SITE}${toolPath(domain, products)}`;
/** The card's Markdown twin (page-markdown.mjs naming): /tools/openai.com.md */
export const toolMdPath = (domain, products = DEFAULT) => toolPath(domain, products).replace(/\/$/, "") + ".md";
/** Astro rest-param value for src/pages/tools/[...card].astro: "openai.com" or "google.com/notebooklm". */
export const toolRouteParam = (domain, products = DEFAULT) => toolPath(domain, products).replace(/^\/tools\//, "").replace(/\/$/, "");

/** `_redirects` lines: each product's old /tools/<domain> path (with and
 *  without the slash, plus its .md twin) -> the product URL, 301. */
export function productRedirects(products = DEFAULT) {
  const lines = [];
  for (const key of Object.keys(products).sort()) {
    const to = toolPath(key, products);
    lines.push(`/tools/${key} ${to} 301`, `/tools/${key}/ ${to} 301`, `/tools/${key}.md ${toolMdPath(key, products)} 301`);
  }
  return lines;
}
