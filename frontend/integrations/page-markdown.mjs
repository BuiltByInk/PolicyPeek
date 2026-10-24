// After `astro build`, writes a Markdown twin of every HTML page that doesn't
// already have one: dist/<path>/index.html -> dist/<path>.md (homepage ->
// dist/index.md). Guides keep their hand-written /guides/<slug>.md source.
// functions/_middleware.js serves these for `Accept: text/markdown`
// (Markdown for Agents content negotiation). Only <main> is converted, so nav,
// footer, scripts and forms are dropped. Runs before csp(); touches no HTML.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import TurndownService from "turndown";

const SITE = "https://getpolicypeek.com";

function htmlPages(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== "_astro" && f !== "fonts") htmlPages(p, out); }
    else if (f === "index.html") out.push(p);
  }
  return out;
}

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function toMarkdown(html, path) {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
  td.remove(["script", "style", "noscript", "form", "button", "svg", "template", "input", "select", "label"]);
  const main = html.match(/<main[\s\S]*?<\/main>/)?.[0];
  if (!main) throw new Error(`page-markdown: no <main> in ${path}`);
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "PolicyPeek").trim();
  const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  let body = td.turndown(main)
    .replace(/\]\(\//g, `](${SITE}/`)       // absolute links for agents
    .replace(/\n{3,}/g, "\n\n").trim();
  return `---\ntitle: ${JSON.stringify(title)}\n${desc ? `description: ${JSON.stringify(desc)}\n` : ""}url: ${SITE}${path}\n---\n\n${body}\n`;
}

export default function pageMarkdown() {
  return {
    name: "page-markdown",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const root = fileURLToPath(dir);
        let n = 0;
        for (const file of htmlPages(root)) {
          const rel = relative(root, file).replace(/\\/g, "/");     // e.g. tools/x.com/index.html
          const path = "/" + rel.replace(/index\.html$/, "");      // /tools/x.com/
          const mdFile = path === "/" ? join(root, "index.md") : join(root, path.replace(/\/$/, "") + ".md");
          if (existsSync(mdFile)) continue;                         // guides: keep the source Markdown
          writeFileSync(mdFile, toMarkdown(readFileSync(file, "utf8"), path));
          n++;
        }
        if (n < 60) throw new Error(`page-markdown: only ${n} pages converted`);
        console.log(`page-markdown: wrote ${n} Markdown twins`);
      },
    },
  };
}
