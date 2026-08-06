import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Placeholder — swap for the real production domain before deploying.
// See DECISIONS_NEEDED.md.
export default defineConfig({
  output: "static",
  site: "https://policypeek.example",
  integrations: [sitemap()],
});
