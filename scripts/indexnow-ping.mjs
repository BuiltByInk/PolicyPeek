#!/usr/bin/env node
// Submit all sitemap URLs to IndexNow (Bing, Yandex, etc). Usage: node scripts/indexnow-ping.mjs
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const HOST = "getpolicypeek.com";
const pub = fileURLToPath(new URL("../frontend/public/", import.meta.url));
const keyFile = readdirSync(pub).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("no IndexNow key file in frontend/public");
const key = keyFile.slice(0, 32);
const locs = async (u) => [...(await (await fetch(u)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
let urls = [];
for (const u of await locs(process.argv[2] || `https://${HOST}/sitemap.xml`)) {
  if (u.endsWith(".xml")) urls.push(...(await locs(u))); else urls.push(u);
}
urls = [...new Set(urls)].filter((u) => new URL(u).host === HOST);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${keyFile}`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
console.log((await res.text()).slice(0, 300));
