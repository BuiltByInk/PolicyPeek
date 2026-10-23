import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import csp from "./integrations/csp.mjs";
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

export default defineConfig({
  output: "static",
  site: SITE,
  integrations: [csp(), sitemap({ filter: (page) => !noindexUrls.has(page) })],
});
