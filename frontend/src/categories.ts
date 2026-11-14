// Product-type classification of existing catalog tools. Used only to group
// cards onto category hub pages and to pick related links. It adds no new
// policy claims: every badge and sentence on a hub is taken from tools.json.
import type { Tool } from "./types";

export interface Category {
  slug: string;
  name: string;
  title: string;
  /** Optional shorter <title> so the layout suffix still fits in 60 characters. */
  pageTitle?: string;
  description: string;
  domains: string[];
}

export const CATEGORIES: Category[] = [
  {
    slug: "chat",
    name: "AI chat tools",
    title: "AI chat tools: which train on your data?",
    description: "PolicyPeek badges for AI chat tools in the catalog, sourced from each tool's own published policy.",
    domains: ["openai.com", "claude.com", "google.com", "microsoft.com", "poe.com", "you.com", "perplexity.ai", "deepseek.com", "kimi.com", "duckduckgo.com", "kagi.com", "mistral.ai"],
  },
  {
    slug: "coding",
    name: "AI coding tools",
    title: "AI coding tools: which train on your data?",
    description: "PolicyPeek badges for AI coding tools in the catalog, sourced from each tool's own published policy.",
    domains: ["github.com", "cursor.com", "sourcegraph.com", "amazon.com", "tabnine.com", "windsurf.com", "replit.com", "jetbrains.com", "bolt.new", "lovable.dev", "vercel.com", "base44.com", "abacus.ai"],
  },
  {
    slug: "writing",
    name: "AI writing tools",
    title: "AI writing tools: which train on your data?",
    description: "PolicyPeek badges for AI writing and translation tools in the catalog, sourced from each tool's own published policy.",
    domains: ["grammarly.com", "jasper.ai", "copy.ai", "writesonic.com", "notion.com", "frase.io", "deepl.com"],
  },
  {
    slug: "image",
    name: "AI image tools",
    title: "AI image tools: which train on your data?",
    description: "PolicyPeek badges for AI image tools in the catalog, sourced from each tool's own published policy.",
    domains: ["midjourney.com", "ideogram.ai", "photoroom.com", "remove.bg", "meshy.ai", "stability.ai", "figma.com"],
  },
  {
    slug: "video",
    name: "AI video tools",
    title: "AI video tools: which train on your data?",
    description: "PolicyPeek badges for AI video tools in the catalog, sourced from each tool's own published policy.",
    domains: ["runway.com", "pika.art", "kling.ai", "invideo.io", "lumalabs.ai", "pictory.ai", "heygen.com"],
  },
  {
    slug: "voice",
    name: "AI voice and audio tools",
    title: "AI voice and audio tools: which train on your data?",
    pageTitle: "Voice tools: which train on your data?",
    description: "PolicyPeek badges for AI voice and audio tools in the catalog, sourced from each tool's own published policy.",
    domains: ["elevenlabs.io", "suno.com", "moises.ai"],
  },
  {
    slug: "meeting-notes",
    name: "AI meeting note tools",
    title: "AI meeting note tools: which train on your data?",
    pageTitle: "Meeting note tools: which train on your data?",
    description: "PolicyPeek badges for AI meeting-note tools in the catalog, sourced from each tool's own published policy.",
    domains: ["granola.ai", "otter.ai", "fireflies.ai", "tldv.io", "zoom.com"],
  },
  {
    slug: "automation",
    name: "AI automation tools",
    title: "AI automation tools: which train on your data?",
    description: "PolicyPeek badges for automation tools in the catalog, sourced from each tool's own published policy.",
    domains: ["zapier.com", "n8n.io"],
  },
  {
    slug: "marketing",
    name: "AI marketing tools",
    title: "AI marketing tools: which train on your data?",
    description: "PolicyPeek badges for marketing tools in the catalog, sourced from each tool's own published policy.",
    domains: ["ahrefs.com", "semrush.com", "buffer.com", "mailchimp.com"],
  },
  {
    slug: "business",
    name: "AI business tools",
    title: "AI business and support tools: which train on your data?",
    pageTitle: "Business tools: which train on your data?",
    description: "PolicyPeek badges for workplace, CRM and support tools in the catalog, sourced from each tool's own published policy.",
    domains: ["hubspot.com", "intercom.com", "zendesk.com", "monday.com", "slack.com"],
  },
];

const byDomain = new Map<string, Category>();
for (const c of CATEGORIES) for (const d of c.domains) byDomain.set(d, c);

export function categoryFor(domain: string): Category | undefined {
  return byDomain.get(domain);
}

export function toolsInCategory(category: Category, tools: Tool[]): Tool[] {
  const set = new Set(category.domains);
  return tools.filter((t) => set.has(t.domain) && t.compliance_status !== "not_ai_tool");
}

/** 3–5 related cards, same category first, then others if the category is small. Never this tool, never noindex pages. */
export function relatedTools(tool: Tool, all: Tool[], count = 5): Tool[] {
  const cat = categoryFor(tool.domain);
  const others = all.filter((t) => t.domain !== tool.domain && t.compliance_status !== "not_ai_tool");
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name);
  const rotate = (list: Tool[]) => {
    const i = list.findIndex((t) => t.name.localeCompare(tool.name) > 0);
    return i <= 0 ? list : [...list.slice(i), ...list.slice(0, i)];
  };
  const same = rotate(others.filter((t) => cat && categoryFor(t.domain)?.slug === cat.slug).sort(byName));
  const rest = rotate(others.filter((t) => !cat || categoryFor(t.domain)?.slug !== cat.slug).sort(byName));
  return [...same, ...rest].slice(0, count);
}
