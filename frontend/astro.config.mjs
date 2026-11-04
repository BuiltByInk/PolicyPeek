import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import csp from "./integrations/csp.mjs";
import guideCta from "./integrations/guide-cta.mjs";
import pageMarkdown from "./integrations/page-markdown.mjs";
import { readFileSync } from "node:fs";

const SITE = "https://getpolicypeek.com";

// not_ai_tool pages are noindex (see Layout.astro's `noindex` prop), so keep
// them out of the sitemap too -- a sitemap that lists noindex URLs sends
// search engines contradictory signals. Read from the same tools.json the
// pages are built from, so the two can't drift.
const tools = JSON.parse(readFileSync(new URL("./data/tools.json", import.meta.url), "utf8"));
const noindexUrls = new Set(
  tools
    .filter((t) => t.compliance_status === "not_ai_tool")
    .map((t) => `${SITE}/tools/${t.domain}/`)
);

// <lastmod> for every sitemap URL (SEO health check, 2026-11-04), from real
// dates only: a tool page uses its last_checked_at, a guide its `modified`
// date from src/guides.ts, everything else the build date.
const toolLastmod = new Map(
  tools
    .filter((t) => t.last_checked_at && !Number.isNaN(new Date(t.last_checked_at).getTime()))
    .map((t) => [`${SITE}/tools/${t.domain}/`, new Date(t.last_checked_at).toISOString()])
);
// src/guides.ts uses import.meta.glob, so it can't be imported here; read its
// META block as text instead (tests check the result against the pages).
const guidesSrc = readFileSync(new URL("./src/guides.ts", import.meta.url), "utf8");
const defaultModified = guidesSrc.match(/\.map\(\(m\) => \(\{[^}]*modified: "(\d{4}-\d{2}-\d{2})"/)?.[1];
const guideLastmod = new Map();
for (const m of guidesSrc.matchAll(/\{ slug: "([a-z0-9-]+)"([^\n]*)\}/g)) {
  const own = m[2].match(/modified: "(\d{4}-\d{2}-\d{2})"/)?.[1];
  const d = own ?? defaultModified;
  if (d) guideLastmod.set(`${SITE}/guides/${m[1]}/`, new Date(`${d}T00:00:00Z`).toISOString());
}
// /guides/ itself changes whenever a guide does.
const latestGuide = [...guideLastmod.values()].sort().at(-1);
if (latestGuide) guideLastmod.set(`${SITE}/guides/`, latestGuide);
const buildDate = new Date().toISOString();
const lastmodFor = (url) => toolLastmod.get(url) ?? guideLastmod.get(url) ?? buildDate;

export default defineConfig({
  output: "static",
  site: SITE,
  integrations: [guideCta(), pageMarkdown(), csp(), sitemap({
      filter: (page) => !noindexUrls.has(page),
      serialize: (item) => ({ ...item, lastmod: lastmodFor(item.url) }),
    })],
});
