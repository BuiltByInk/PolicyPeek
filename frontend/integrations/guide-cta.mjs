// After `astro build`, inserts the Starter Pack call-to-action mid-article in the
// five business guides: just before the guide's second H2, i.e. after the
// answer-first intro and the first question. Static HTML, no JS. Only the
// rendered page gets it; the plain-text /guides/<slug>.md for AI tools is
// untouched. Runs before csp() (order in astro.config) -- it adds no scripts.
// If the insertion point is missing the build FAILS, so a CTA can't silently vanish.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gumroadLink } from "../src/gumroad.ts";

export const POLICY_GUIDES = [
  "do-uk-small-businesses-need-an-ai-policy",
  "eu-ai-act-article-4-ai-literacy-small-uk-business",
  "ai-acceptable-use-policy-template-small-business-uk",
  "is-it-safe-to-put-customer-data-into-chatgpt-uk-gdpr",
  "how-to-train-staff-on-ai-30-minute-session",
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export function midBox(slug) {
  return `<aside class="pack-box pack-box-mid" aria-labelledby="pack-mid-h">` +
    `<p class="pack-box-title" id="pack-mid-h">Need an AI policy for your team?</p>` +
    `<p>The AI Policy Starter Pack: an editable UK AI policy, one-page staff rules and an EU AI Act Article 4 checklist. Ready to adapt in Word or Google Docs. £19.</p>` +
    `<p class="pack-box-go"><a class="btn" href="${esc(gumroadLink("starter", `guide-mid-${slug}`))}">Get the Starter Pack, £19</a> ` +
    `<span>or <a href="${esc(gumroadLink("checklist", `guide-mid-${slug}`))}">get the free AI checklist</a></span></p></aside>`;
}

export function insertMid(html, slug) {
  const start = html.indexOf('<article class="guide');
  if (start < 0) throw new Error(`guide-cta: no <article> in ${slug}`);
  const first = html.indexOf("<h2", start);
  const second = first < 0 ? -1 : html.indexOf("<h2", first + 3);
  const end = html.indexOf("</article>", start);
  if (second < 0 || second > end) throw new Error(`guide-cta: ${slug} needs two H2s for the mid-article CTA`);
  return html.slice(0, second) + midBox(slug) + html.slice(second);
}

export default function guideCta() {
  return {
    name: "guide-cta",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const root = fileURLToPath(dir);
        for (const slug of POLICY_GUIDES) {
          const f = join(root, "guides", slug, "index.html");
          writeFileSync(f, insertMid(readFileSync(f, "utf8"), slug));
        }
      },
    },
  };
}
