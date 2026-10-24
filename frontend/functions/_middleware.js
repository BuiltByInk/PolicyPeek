// Markdown for Agents content negotiation.
// `Accept: text/markdown` (preferred over text/html) gets the page's Markdown
// twin (built by integrations/page-markdown.mjs); everything else -- browsers,
// */*, no Accept -- gets HTML as before. All pages get `Vary: Accept`.
// AI-training-crawler blocking (403) happens at the Cloudflare zone before
// this runs, so it is unaffected.
function q(accept, type) {
  let best = -1;
  for (const part of accept.split(",")) {
    const [t, ...params] = part.trim().toLowerCase().split(";");
    if (t.trim() !== type) continue;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const v = qp ? parseFloat(qp.slice(2)) : 1;
    best = Math.max(best, isNaN(v) ? 0 : v);
  }
  return best;
}

export function wantsMarkdown(accept) {
  if (!accept) return false;
  const md = q(accept, "text/markdown");
  return md > 0 && md >= q(accept, "text/html");
}

function mdPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "/index.md";
  if (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith(".html")) return null; // assets, .md, .txt, .xml
  return pathname.replace(/\/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "") + ".md";
}

const addVary = (res) => {
  const r = new Response(res.body, res);
  const v = r.headers.get("Vary");
  if (!v || !/\baccept\b/i.test(v)) r.headers.set("Vary", v ? `${v}, Accept` : "Accept");
  return r;
};

export async function onRequest(ctx) {
  const { request, env, next } = ctx;
  const url = new URL(request.url);
  const p = (request.method === "GET" || request.method === "HEAD") && wantsMarkdown(request.headers.get("Accept")) ? mdPath(url.pathname) : null;
  if (p) {
    const asset = await env.ASSETS.fetch(new Request(new URL(p, url), { headers: { Accept: "*/*" } }));
    const ct = asset.headers.get("Content-Type") || "";
    if (asset.ok && !ct.includes("text/html")) {
      const text = await asset.text();
      const h = new Headers(asset.headers);
      h.set("Content-Type", "text/markdown; charset=utf-8");
      h.set("Vary", "Accept");
      h.set("x-markdown-tokens", String(Math.ceil(text.length / 4)));
      h.delete("Content-Length");
      return new Response(request.method === "HEAD" ? null : text, { status: 200, headers: h });
    }
  }
  const res = await next();
  const ct = res.headers.get("Content-Type") || "";
  return ct.includes("text/html") ? addVary(res) : res;
}
