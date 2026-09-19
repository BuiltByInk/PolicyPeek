// Shared cleaning for short free-text values that come from outside (the
// model's extraction of an attacker-influenceable page, an anonymous caller's
// form fields). Everything here ends up stored and shown to other people, so:
// control characters, C1 controls, zero-width characters, bidirectional
// overrides, line/paragraph separators and BOMs are turned into spaces (they
// can spoof or hide text without being an injection risk), and truncation
// counts code points so it can't cut a surrogate pair in half.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

export function cleanText(value: unknown, max: number, { ellipsis = false } = {}): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;
  const points = [...cleaned];
  if (points.length <= max) return cleaned;
  return ellipsis ? `${points.slice(0, max - 1).join("")}…` : points.slice(0, max).join("");
}
