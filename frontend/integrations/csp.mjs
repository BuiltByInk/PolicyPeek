// Builds the site's Content-Security-Policy after `astro build` and writes it
// into dist/_headers (Cloudflare Pages), replacing the __CSP__ placeholder that
// public/_headers carries. Inline <script type="module"> blocks Astro emits are
// allowed by sha256 hash, so script-src never needs 'unsafe-inline'. JSON-LD
// (<script type="application/ld+json">) is a data block, not executed, so CSP
// doesn't apply to it. If the placeholder isn't replaced the build FAILS, so a
// broken header can never ship.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

export const PLACEHOLDER = "__CSP__";

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

// Executable inline scripts: <script> with no src and no non-JS type.
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\ssrc\s*=/.test(attrs)) continue;
    const type = attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && type !== "module" && type !== "text/javascript") continue;
    hashes.add(`'sha256-${createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  }
  return hashes;
}

export function buildCsp({ scriptHashes, apiBase }) {
  let apiOrigin = "";
  if (apiBase) {
    try { apiOrigin = new URL(apiBase).origin; } catch { apiOrigin = ""; }
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${[...scriptHashes].sort().join(" ")} https://static.cloudflareinsights.com`.replace(/\s+/g, " "),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? " " + apiOrigin : ""} https://cloudflareinsights.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default function csp() {
  return {
    name: "policypeek-csp",
    hooks: {
      "astro:build:done": ({ dir }) => {
        const dist = fileURLToPath(dir);
        const hashes = new Set();
        for (const f of htmlFiles(dist)) for (const h of inlineScriptHashes(readFileSync(f, "utf8"))) hashes.add(h);
        const policy = buildCsp({ scriptHashes: hashes, apiBase: process.env.PUBLIC_API_BASE_URL ?? loadEnv("production", process.cwd(), "PUBLIC_").PUBLIC_API_BASE_URL });
        const headersPath = join(dist, "_headers");
        const src = readFileSync(headersPath, "utf8");
        if (!src.includes(PLACEHOLDER)) throw new Error("policypeek-csp: __CSP__ placeholder missing from _headers");
        writeFileSync(headersPath, src.replace(PLACEHOLDER, policy));
      },
    },
  };
}
