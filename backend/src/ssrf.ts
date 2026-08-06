// SSRF-safe fetch wrapper for POST /v1/check. Submitted URLs are untrusted —
// this blocks fetches into the private network (including the cloud metadata
// endpoint) and re-validates on every redirect hop rather than trusting fetch's
// automatic redirect handling.

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 500_000;

export class SsrfBlockedError extends Error {}

function isBlockedIpv4(a: number, b: number): boolean {
  if (a === 127) return true; // loopback
  if (a === 10) return true; // RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 0) return true;
  return false;
}

// Fully expands an IPv6 literal (handling "::" shorthand) into 8 16-bit
// groups, or returns null if it doesn't parse. A naive string-prefix check
// (e.g. hostname.startsWith("fe80:")) misses equivalent forms of the same
// address — this normalizes first so every representation of the same
// address gets the same verdict.
function expandIpv6(hostname: string): number[] | null {
  if (!hostname.includes(":")) return null;
  const parts = hostname.split("::");
  if (parts.length > 2) return null;

  const parseGroups = (s: string): number[] | null => {
    if (s === "") return [];
    const groups = s.split(":");
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };

  if (parts.length === 1) {
    const groups = parseGroups(parts[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseGroups(parts[0]);
  const tail = parseGroups(parts[1]);
  if (!head || !tail || head.length + tail.length >= 8) return null;
  const missing = 8 - head.length - tail.length;
  return [...head, ...Array(missing).fill(0), ...tail];
}

// "::ffff:127.0.0.1"-style dotted-quad tails only parse cleanly once a URL
// object has canonicalized them to pure hex groups (e.g. "::ffff:7f00:1") —
// relying on that happening upstream is fragile (platform/parser-dependent),
// so normalize it here too rather than trusting the caller already did.
function convertTrailingIpv4(hostname: string): string {
  const m = hostname.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return hostname;
  const octets = [m[2], m[3], m[4], m[5]].map(Number);
  if (octets.some((n) => n > 255)) return hostname;
  const [a, b, c, d] = octets;
  const hi = ((a << 8) | b).toString(16);
  const lo = ((c << 8) | d).toString(16);
  return `${m[1]}${hi}:${lo}`;
}

export function isBlockedIpLiteral(rawHostname: string): boolean {
  const hostname = convertTrailingIpv4(rawHostname);

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    return isBlockedIpv4(Number(ipv4[1]), Number(ipv4[2]));
  }

  const groups = expandIpv6(hostname);
  if (!groups) return false;

  const isZero = (n: number) => n === 0;
  if (groups.slice(0, 7).every(isZero) && groups[7] <= 1) return true; // :: and ::1
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if (groups[0] === 0x64 && groups[1] === 0xff9b) return true; // NAT64 well-known prefix (64:ff9b::/96)

  // IPv4-mapped / IPv4-compatible: ::ffff:a.b.c.d or ::a.b.c.d
  if (groups.slice(0, 5).every(isZero) && (groups[5] === 0xffff || groups[5] === 0)) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    return isBlockedIpv4(a, b);
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
