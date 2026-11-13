// F7: normalise before hashing/diffing, so only real wording changes count.
const DROP_BLOCKS = ["script", "style", "noscript", "svg", "template", "iframe", "nav", "header", "footer", "aside", "form", "head"];
const BLOCK_TAGS = /<\/?(p|div|section|article|main|li|ul|ol|h[1-6]|tr|td|th|table|br|hr|blockquote|pre|dd|dt|dl)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…", copy: "©", reg: "®", trade: "™" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, " ");
  for (const t of DROP_BLOCKS) s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}\\s*>`, "gi"), "\n");
  s = s.replace(BLOCK_TAGS, "\n").replace(/<[^>]+>/g, " ");
  return decodeEntities(s);
}

// Volatile tokens that change without the policy changing.
const VOLATILE: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:am|pm|AM|PM)?\b/g,
  /©\s*(?:\d{4}\s*[-–]\s*)?\d{4}/g,
  /\bcopyright\s+(?:\d{4}\s*[-–]\s*)?\d{4}\b/gi,
  /\b[a-f0-9]{24,}\b/gi,
  /\b[A-Za-z0-9+/_-]{40,}={0,2}/g,
];

export function normaliseText(text: string): string {
  let s = text.replace(/\r\n?/g, "\n");
  for (const r of VOLATILE) s = s.replace(r, " ");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0\u2000-\u200b]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function normaliseHtml(html: string): string {
  return normaliseText(htmlToText(html));
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const DIFF_MAX_BYTES = 20 * 1024;
const LCS_MAX_CELLS = 4_000_000;

// Line-based unified diff (3 lines context), capped at 20 KB.
export function unifiedDiff(a: string, b: string, labelA = "previous", labelB = "current"): { diff: string; truncated: boolean; added: number; removed: number } {
  const A = a.split("\n"), B = b.split("\n");
  // Trim common prefix/suffix to keep the LCS table small.
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a2 = A.slice(pre, A.length - suf), b2 = B.slice(pre, B.length - suf);
  type Op = { t: " " | "-" | "+"; l: string; ai: number; bi: number };
  const ops: Op[] = [];
  for (let i = 0; i < pre; i++) ops.push({ t: " ", l: A[i], ai: i, bi: i });
  if (a2.length * b2.length <= LCS_MAX_CELLS) {
    const n = a2.length, m = b2.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a2[i] === b2[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a2[i] === b2[j]) { ops.push({ t: " ", l: a2[i], ai: pre + i, bi: pre + j }); i++; j++; }
      else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { ops.push({ t: "-", l: a2[i], ai: pre + i, bi: pre + j }); i++; }
      else { ops.push({ t: "+", l: b2[j], ai: pre + i, bi: pre + j }); j++; }
    }
  } else {
    for (let i = 0; i < a2.length; i++) ops.push({ t: "-", l: a2[i], ai: pre + i, bi: pre });
    for (let j = 0; j < b2.length; j++) ops.push({ t: "+", l: b2[j], ai: A.length - suf, bi: pre + j });
  }
  for (let k = 0; k < suf; k++) ops.push({ t: " ", l: A[A.length - suf + k], ai: A.length - suf + k, bi: B.length - suf + k });
  const added = ops.filter((o) => o.t === "+").length, removed = ops.filter((o) => o.t === "-").length;
  const out: string[] = [`--- ${labelA}`, `+++ ${labelB}`];
  const C = 3;
  let k = 0;
  while (k < ops.length) {
    if (ops[k].t === " ") { k++; continue; }
    let start = Math.max(0, k - C), end = k;
    while (end < ops.length) {
      if (ops[end].t !== " ") { end++; continue; }
      let run = 0;
      while (end + run < ops.length && ops[end + run].t === " ") run++;
      if (end + run >= ops.length || run > 2 * C) { end = Math.min(ops.length, end + C); break; }
      end += run;
    }
    const hunk = ops.slice(start, end);
    const aStart = hunk[0].ai + 1, bStart = hunk[0].bi + 1;
    out.push(`@@ -${aStart},${hunk.filter((o) => o.t !== "+").length} +${bStart},${hunk.filter((o) => o.t !== "-").length} @@`);
    for (const o of hunk) out.push(`${o.t}${o.l}`);
    k = end;
  }
  let diff = out.join("\n") + "\n";
  let truncated = false;
  const enc = new TextEncoder().encode(diff);
  if (enc.byteLength > DIFF_MAX_BYTES) {
    diff = new TextDecoder().decode(enc.slice(0, DIFF_MAX_BYTES)).replace(/\uFFFD+$/, "") + "\n[diff truncated at 20 KB]\n";
    truncated = true;
  }
  return { diff, truncated, added, removed };
}
