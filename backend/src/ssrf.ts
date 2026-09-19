// SSRF-safe fetch wrapper for POST /v1/check. Submitted URLs are untrusted —
// this blocks fetches into the private network (including the cloud metadata
// endpoint) and re-validates on every redirect hop rather than trusting fetch's
// automatic redirect handling.
//
// DNS-resolution-based bypass (fixed 2026-08-18, see security/review-2026-08-18.md
// finding #1): the checks above only ever inspected the *literal* hostname/IP
// string in the submitted URL. A hostname like "169-254-169-254.nip.io"
// (real wildcard-DNS service) isn't itself a blocked literal, but resolves at
// fetch()-time straight to the cloud metadata address -- full bypass. Fixed by
// resolving every non-literal hostname ourselves via DNS-over-HTTPS (Cloudflare's
// 1.1.1.1 resolver, reachable from a Worker like any other fetch target) before
// each connection attempt -- initial URL and every redirect hop -- and rejecting
// if ANY returned A/AAAA answer is private/link-local/loopback/metadata.
//
// Residual risk, accepted and documented rather than silently left open:
// Cloudflare Workers' fetch() gives no hook to pin the exact IP a request
// connects to, so this closes the primary "submit a hostname that resolves to
// a blocked address" attack, but cannot fully close classic DNS-rebinding
// TOCTOU (a malicious authoritative zone returning a safe IP to our DoH
// pre-check and a different, blocked IP microseconds later to the runtime's
// own resolution inside fetch()). True IP-pinning isn't achievable in this
// runtime today. Logged in DECISIONS_NEEDED.md per the review's instruction.

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

const MAX_REDIRECTS = 5;
// Was 8000 -- too tight for slower policy pages (e.g. adobe.com timed out
// twice on submission). Redirect hops each get their own fresh timeout, so
// this only affects per-hop wait, not total request time.
const FETCH_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 500_000;

// Cloudflare's own DoH JSON endpoint -- a fixed, hardcoded host, not
// attacker-influenced input (same rationale as archive.org in
// waybackFallback.ts), so this is called via plain fetch(), not through this
// very wrapper (that would be circular).
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DOH_TIMEOUT_MS = 5_000;
const DOH_RECORD_TYPES = ["A", "AAAA"] as const;

export class SsrfBlockedError extends Error {}

function isBlockedIpv4(a: number, b: number, c: number = -1): boolean {
  // Documentation ranges and the IETF protocol block are never real targets.
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24 (TEST-NET-1)
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a >= 224) return true; // multicast, reserved, broadcast
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
export function expandIpv6(hostname: string): number[] | null {
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
    return isBlockedIpv4(Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]));
  }

  const groups = expandIpv6(hostname);
  if (!groups) return false;

  const isZero = (n: number) => n === 0;
  if (groups.slice(0, 7).every(isZero) && groups[7] <= 1) return true; // :: and ::1
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if (groups[0] === 0x64 && groups[1] === 0xff9b) return true; // NAT64 (64:ff9b::/96 and 64:ff9b:1::/48)
  if (groups[0] === 0x2002) return true; // 6to4: embeds an IPv4 address, never a legitimate policy host
  if (groups[0] === 0x2001 && groups[1] === 0) return true; // Teredo tunnelling
  // SIIT-translated IPv4: ::ffff:0:a.b.c.d
  if (groups.slice(0, 4).every(isZero) && groups[4] === 0xffff && groups[5] === 0) {
    return isBlockedIpv4((groups[6] >> 8) & 0xff, groups[6] & 0xff, (groups[7] >> 8) & 0xff);
  }

  // IPv4-mapped / IPv4-compatible: ::ffff:a.b.c.d or ::a.b.c.d
  if (groups.slice(0, 5).every(isZero) && (groups[5] === 0xffff || groups[5] === 0)) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    return isBlockedIpv4(a, b, c);
  }

  return false;
}

// A hostname that is already a literal IP (or bracketed IPv6 literal) needs
// no DNS resolution -- isBlockedIpLiteral above already ruled on it directly.
// Domain names never contain a colon, so this is a safe/cheap discriminator.
function isIpLiteralHostname(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":");
}

interface DohAnswer {
  type: number;
  data: string;
}
interface DohResponse {
  Answer?: DohAnswer[];
}

// DNS record type numbers per RFC 1035 / RFC 3596.
const DOH_TYPE_NUM: Record<(typeof DOH_RECORD_TYPES)[number], number> = { A: 1, AAAA: 28 };

async function resolveViaDoh(hostname: string, type: (typeof DOH_RECORD_TYPES)[number]): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
  try {
    const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new SsrfBlockedError("dns_resolution_failed");
    const body = (await res.json()) as DohResponse;
    const wantType = DOH_TYPE_NUM[type];
    return (body.Answer ?? []).filter((a) => a.type === wantType).map((a) => a.data);
  } finally {
    clearTimeout(timeout);
  }
}

// Resolves hostname via DoH (both A and AAAA) and rejects if ANY returned
// address is private/link-local/loopback/metadata -- reject-if-any-bad, not
// reject-if-first-bad, since a multi-answer response can rebind on a later
// answer. Fails closed: if DNS resolution itself errors out (resolver down,
// network blip, timeout), that's treated as blocked rather than silently
// skipping the safety check. A genuinely empty answer set (NXDOMAIN, no
// records) is not itself unsafe -- fetch() will simply fail to connect, so
// that's let through rather than blocked.
async function assertResolvedAddressesSafe(hostname: string): Promise<void> {
  if (isIpLiteralHostname(hostname)) return;

  let addresses: string[];
  try {
    const results = await Promise.all(DOH_RECORD_TYPES.map((type) => resolveViaDoh(hostname, type)));
    addresses = results.flat();
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    throw new SsrfBlockedError("dns_resolution_failed");
  }

  for (const ip of addresses) {
    if (isBlockedIpLiteral(ip)) {
      throw new SsrfBlockedError("blocked_target_resolved_ip");
    }
  }
}

async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError("blocked_protocol");
  }
  // A policy page is always on the default web ports. Refusing anything else
  // stops a submitted URL from being used to probe other services on a host.
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    throw new SsrfBlockedError("blocked_port");
  }
  if (url.username !== "" || url.password !== "") {
    throw new SsrfBlockedError("blocked_credentials_in_url");
  }
  // Trailing dots are the same host ("localhost." is "localhost"); strip them
  // so the name checks below can't be skipped by one.
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  const lowerHost = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lowerHost) || lowerHost.endsWith(".localhost") || isBlockedIpLiteral(hostname)) {
    throw new SsrfBlockedError("blocked_target");
  }
  // An IPv6 literal we can't parse must not slip past both the literal check
  // and DNS (isIpLiteralHostname skips DNS for anything with a colon): refuse it.
  if (hostname.includes(":") && expandIpv6(convertTrailingIpv4(hostname)) === null) {
    throw new SsrfBlockedError("blocked_target");
  }
  // Literal-string checks above only catch a submitted hostname that IS
  // itself a blocked IP. Resolve it ourselves and check every answer to
  // catch a hostname that resolves TO a blocked IP (wildcard-DNS bypass /
  // DNS rebinding) -- see the file-header comment for what this does and
  // doesn't close.
  await assertResolvedAddressesSafe(hostname);
  return url;
}

export async function safeFetchText(rawUrl: string): Promise<string> {
  return (await safeFetchTextWithFinalUrl(rawUrl)).text;
}

// Same fetch, but also reports the URL the body actually came from after any
// redirects, so a caller can tell whether the content is from the host that
// was submitted or from somewhere a redirect sent us (see check.ts's
// fetchPolicyText).
export async function safeFetchTextWithFinalUrl(rawUrl: string): Promise<{ text: string; finalUrl: string }> {
  let currentUrl = await assertSafeUrl(rawUrl);

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
      currentUrl = await assertSafeUrl(new URL(location, currentUrl).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`fetch_failed_${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return { text: "", finalUrl: currentUrl.toString() };
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
    return { text: new TextDecoder().decode(buf), finalUrl: currentUrl.toString() };
  }

  throw new SsrfBlockedError("too_many_redirects");
}
