// Catalog dry run (13 Nov handoff): fetch each tools.json source URL, normalise,
// and compare with the stored quote. No model calls, no D1 writes, no deploy.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normaliseHtml, normaliseText, sha256Hex } from "../src/normalise";
import { quoteAppearsVerbatim } from "../src/gate";

const USER_AGENT = "PolicyPeek-PolicyWatch/1.0 (+https://getpolicypeek.com/about; privacy@getpolicypeek.com)";
const TIMEOUT_MS = 12_000;
const MAX_BODY = 500_000;
const PER_HOST_GAP_MS = 1_000;
const MAX_HOSTS = 6;

interface Tool {
  name: string;
  domain: string;
  compliance_status: string;
  summary: string | null;
  source_urls: string[];
  last_checked_at?: string | null;
}

function quotesFrom(summary: string | null): string[] {
  if (!summary) return [];
  const quoted = [...summary.matchAll(/"([^"]{12,})"/g)].map((m) => m[1].trim());
  if (quoted.length) return quoted;
  return summary.split(/(?<=[.!?])\s+(?=["A-Z])/).map((x) => x.trim()).filter((s) => s.length >= 12);
}

function nearby(text: string, quote: string, radius = 180): string | null {
  const hay = text.replace(/\s+/g, " ");
  const needle = quote.replace(/\s+/g, " ").trim();
  const words = needle.split(" ").filter((w) => w.length > 4).slice(0, 6);
  for (const w of words) {
    const i = hay.toLowerCase().indexOf(w.toLowerCase());
    if (i >= 0) return hay.slice(Math.max(0, i - 40), Math.min(hay.length, i + radius)).trim();
  }
  return hay.slice(0, radius).trim() || null;
}

async function fetchUrl(url: string): Promise<{ ok: boolean; status?: number; reason?: string; text?: string; finalUrl?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok) return { ok: false, status: res.status, reason: `http_${res.status}`, ms: Date.now() - t0, finalUrl: res.url };
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_BODY ? buf.slice(0, MAX_BODY) : buf;
    if (ct === "application/pdf") {
      return { ok: true, status: res.status, text: "", reason: "pdf_bytes_only", ms: Date.now() - t0, finalUrl: res.url };
    }
    const raw = new TextDecoder().decode(sliced);
    const text = ct === "text/plain" ? normaliseText(raw) : normaliseHtml(raw);
    return { ok: true, status: res.status, text, ms: Date.now() - t0, finalUrl: res.url };
  } catch (e) {
    const name = (e as Error)?.name;
    const reason = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network_error";
    return { ok: false, reason, ms: Date.now() - t0 };
  }
}

function groupByHost(urls: { tool: Tool; url: string }[]): Map<string, { tool: Tool; url: string }[]> {
  const m = new Map<string, { tool: Tool; url: string }[]>();
  for (const item of urls) {
    let host = "invalid";
    try { host = new URL(item.url).hostname.replace(/^www\./, ""); } catch { /* */ }
    m.set(host, [...(m.get(host) ?? []), item]);
  }
  return m;
}

async function main() {
  const toolsPath = process.argv[2];
  const outPath = process.argv[3];
  const tools = JSON.parse(readFileSync(toolsPath, "utf8")) as Tool[];
  const jobs: { tool: Tool; url: string }[] = [];
  for (const tool of tools) for (const url of tool.source_urls ?? []) jobs.push({ tool, url });

  const results: any[] = [];
  const hosts = [...groupByHost(jobs).values()];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const batch = hosts[next++];
      for (let i = 0; i < batch.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, PER_HOST_GAP_MS));
        const { tool, url } = batch[i];
        const fetched = await fetchUrl(url);
        const quotes = quotesFrom(tool.summary);
        const report: any = {
          name: tool.name,
          domain: tool.domain,
          url,
          status: fetched.status ?? null,
          reason: fetched.reason ?? (fetched.ok ? "ok" : "failed"),
          ms: fetched.ms,
          finalUrl: fetched.finalUrl ?? null,
          last_checked_at: tool.last_checked_at ?? null,
          old_quotes: quotes,
          quotes_verbatim: [] as { quote: string; appears: boolean; nearby: string | null }[],
        };
        if (fetched.ok && fetched.text != null) {
          report.sha256 = fetched.text ? await sha256Hex(fetched.text) : null;
          report.text_len = fetched.text.length;
          for (const q of quotes) {
            const appears = quoteAppearsVerbatim(q, fetched.text);
            report.quotes_verbatim.push({ quote: q, appears, nearby: appears ? null : nearby(fetched.text, q) });
          }
        }
        results.push(report);
        const flag = !fetched.ok ? "FAIL" : report.quotes_verbatim.some((x: any) => !x.appears) ? "QUOTE" : "OK";
        console.error(`${flag} ${tool.domain} ${url} ${report.reason}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_HOSTS, hosts.length) }, worker));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), n_tools: tools.length, n_urls: jobs.length, results }, null, 2));
  console.error(`wrote ${outPath} (${results.length} urls)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
