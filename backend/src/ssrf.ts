// SSRF-safe fetch wrapper for POST /v1/check. Submitted URLs are untrusted —
// this blocks fetches into the private network (including the cloud metadata
// endpoint) and re-validates on every redirect hop rather than trusting fetch's
// automatic redirect handling.

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 500_000;

export class SsrfBlockedError extends Error {}

function isBlockedIpLiteral(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 0) return true;
    return false;
  }

  // IPv6 loopback / unique-local / link-local.
  const lower = hostname.toLowerCase();
  if (lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  return false;
}

function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("blocked_protocol");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase()) || isBlockedIpLiteral(hostname)) {
    throw new SsrfBlockedError("blocked_target");
  }
  return url;
}

export async function safeFetchText(rawUrl: string): Promise<string> {
  let currentUrl = assertSafeUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "PolicyPeek-Checker/1.0" },
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SsrfBlockedError("redirect_without_location");
      currentUrl = assertSafeUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`fetch_failed_${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    await reader.cancel().catch(() => {});
    const buf = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(buf);
  }

  throw new SsrfBlockedError("too_many_redirects");
}
