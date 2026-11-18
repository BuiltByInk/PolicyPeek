// Lists from deliverables/claude-outbound/02-policypeek-catalog.md
// (10 Nov 2026 steward / Elliot rulings). A tool on any of these lists
// cannot auto-publish a card change (Task 3 gate, rule 4).
// Mailchimp stays held. The 10 Nov recheck list stays paused.
// ChatGPT (openai.com) was a medium-flag wording item with an outbound-citation
// exception only; the auto-publish gate still treats it as medium-flagged.

export const HELD_DOMAINS = ["mailchimp.com"] as const;

export const RECHECK_DOMAINS = [
  "ahrefs.com",
  "amazon.com",
  "bolt.new",
  "buffer.com",
  "copy.ai",
  "cursor.com",
  "google.com",
  "invideo.io",
  "jasper.ai",
  "kagi.com",
  "kling.ai",
  "mailchimp.com",
  "meshy.ai",
  "microsoft.com",
  "otter.ai",
  "pika.art",
  "poe.com",
  "replit.com",
  "remove.bg",
  "runway.com",
  "sourcegraph.com",
  "stability.ai",
  "vercel.com",
  "windsurf.com",
] as const;

export const MEDIUM_FLAG_DOMAINS = [
  "claude.com",
  "deepl.com",
  "duckduckgo.com",
  "figma.com",
  "github.com",
  "grammarly.com",
  "heygen.com",
  "hubspot.com",
  "intercom.com",
  "jetbrains.com",
  "kimi.com",
  "lovable.dev",
  "midjourney.com",
  "mistral.ai",
  "notion.com",
  "openai.com",
  "perplexity.ai",
  "slack.com",
  "tabnine.com",
  "you.com",
  "zapier.com",
  "zendesk.com",
] as const;

const held = new Set<string>(HELD_DOMAINS);
const recheck = new Set<string>(RECHECK_DOMAINS);
const medium = new Set<string>(MEDIUM_FLAG_DOMAINS);

/** Accept a domain or a tool_slug that starts with the catalog domain. */
export function catalogDomain(toolSlug: string): string {
  const s = toolSlug.trim().toLowerCase();
  // slugs are usually the catalog domain; a "#product" suffix is stripped.
  return s.split("#")[0] ?? s;
}

export type ListHit = "held" | "recheck" | "medium_flag";

export function listHit(toolSlug: string): ListHit | null {
  const d = catalogDomain(toolSlug);
  if (held.has(d)) return "held";
  if (recheck.has(d)) return "recheck";
  if (medium.has(d)) return "medium_flag";
  return null;
}
