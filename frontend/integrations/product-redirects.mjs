// Appends the product-URL 301s (src/toolPaths.mjs productRedirects) to
// dist/_redirects after the build, and FAILS the build if the products
// registry is invalid or a redirect source would shadow a built page or an
// existing public/_redirects rule (Cloudflare Pages applies _redirects before
// static files, first match wins).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProducts, productRedirects, validateProducts } from "../src/toolPaths.mjs";

export default function productRedirectsIntegration() {
  return {
    name: "product-redirects",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const root = fileURLToPath(dir);
        const tools = JSON.parse(readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));
        const products = loadProducts();
        const problems = validateProducts(products, tools);
        const lines = productRedirects(products);
        const file = join(root, "_redirects");
        const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
        const sources = new Set(existing.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)[0]));
        for (const l of lines) {
          const from = l.split(" ")[0];
          if (sources.has(from)) problems.push(`_redirects already has a rule for ${from}`);
          const page = from.endsWith(".md") ? join(root, from) : join(root, from.replace(/\/?$/, "/"), "index.html");
          if (existsSync(page)) problems.push(`redirect ${from} would shadow a built page`);
        }
        if (problems.length) throw new Error(`product-redirects:\n  - ${problems.join("\n  - ")}`);
        if (lines.length) appendFileSync(file, `\n# Product URLs (D4, generated from data/products.json)\n${lines.join("\n")}\n`);
        console.log(`product-redirects: ${lines.length} rule(s)`);
      },
    },
  };
}
