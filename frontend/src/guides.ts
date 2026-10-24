// Guides (/guides/): long-form answers built from src/guides/*.md. The same
// Markdown is rendered as HTML at /guides/<slug>/ and served as-is at
// /guides/<slug>.md for AI agents and scrapers. Update `modified` together with
// the "Last checked" line inside the Markdown whenever the data changes.
const raw = import.meta.glob<string>("./guides/*.md", { query: "?raw", import: "default", eager: true });

export const SITE = "https://getpolicypeek.com";

interface Meta { slug: string; description: string; published: string; modified: string }
// Order = priority on the /guides/ index and in llms.txt.
const META: Meta[] = [
  { slug: "free-ai-privacy-policy-checker", description: "PolicyPeek is a free checker that reads AI tools' own privacy policies and terms and tells you, in one badge, whether they train on your data. 59 tools checked." },
  { slug: "how-to-check-if-an-app-trains-ai-on-your-data", description: "Find out in two minutes whether an app uses your data to train AI: where to look in its policy, the exact phrases that matter, and a free checker." },
  { slug: "does-chatgpt-train-on-your-data", description: "Does ChatGPT train on your data? Yes, by default, but OpenAI's own policy says you can opt out. Here's the exact wording, plus how other AI tools compare." },
  { slug: "ai-tools-that-dont-train-on-your-data-uk", description: "14 AI tools whose own privacy policies say they don't train on your data, from Kagi to Zoom, plus what UK users should know about opt-outs. Checked Oct 2026." },
  { slug: "ai-tools-that-train-on-your-data-no-opt-out", description: "15 AI tools whose own policies let them train on your content with no opt-out found, from Mailchimp to Suno. Quotes and sources, checked Oct 2026." },
  { slug: "does-mailchimp-use-your-data-for-ai-training", description: "Mailchimp's terms let it use your inputs, outputs and customer data to improve its AI model, with no opt-out found. How HubSpot, Ahrefs, Semrush and others compare." },
  { slug: "ai-meeting-note-takers-that-dont-train-on-your-data", description: "Which AI note-takers train on your meeting recordings and how to opt out. Zoom, Fireflies and tl;dv say they don't; Otter trains with no opt-out found." },
  { slug: "do-ai-coding-assistants-train-on-your-code", description: "Which AI coding tools and app builders train on your code: Tabnine and Cody say no, Cursor and Windsurf let you opt out, Base44 has no opt-out. Checked Oct 2026." },
  { slug: "how-to-opt-out-of-ai-training-image-video-music-tools", description: "Which AI image, video, voice and music generators train on your uploads, which let you opt out, and how. Suno, Pika, ElevenLabs, Photoroom and more, checked Oct 2026." },
].map((m) => ({ published: "2026-10-24", modified: "2026-10-24", ...m }));

export interface Guide extends Meta {
  title: string;
  markdown: string;
  /** Markdown without the H1 and the "Last checked" line (the page renders those itself). */
  body: string;
  faqs: { q: string; a: string }[];
  /** Tool domains this guide links to (for "Guides that mention X" on tool pages). */
  domains: string[];
}

// Drop link-only citations like "([ChatGPT](...))" first; they read as noise in plain text.
const plain = (md: string) =>
  md.replace(/\s*\((\[[^\]]+\]\([^)]+\)(,\s*)?)+\)/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s*\(\s*\)/g, "").replace(/\s+/g, " ").trim();

function parse(m: Meta): Guide {
  const markdown = raw[`./guides/${m.slug}.md`];
  if (!markdown) throw new Error(`guides: missing src/guides/${m.slug}.md`);
  const lines = markdown.split("\n");
  if (!lines[0].startsWith("# ")) throw new Error(`guides: ${m.slug}.md must start with an H1`);
  const title = lines[0].slice(2).trim();
  const body = lines.slice(1).join("\n").replace(/^\s*\*Last checked:[^\n]*\*\s*\n/, "").trim();
  if (/^# /m.test(body)) throw new Error(`guides: ${m.slug}.md has more than one H1`);
  const faqs: Guide["faqs"] = [];
  const faq = body.split(/^## FAQ\s*$/m)[1] ?? "";
  for (const block of faq.split(/^### /m).slice(1)) {
    const [q, ...rest] = block.split("\n");
    const a = plain(rest.join("\n").split(/^## /m)[0].split(/\n\n\[[^\]]+\]\([^)]+\)\s*$/)[0]);
    if (q.trim() && a) faqs.push({ q: q.trim(), a });
  }
  const domains = [...new Set([...markdown.matchAll(/getpolicypeek\.com\/tools\/([a-z0-9.-]+)\//g)].map((x) => x[1]))];
  return { ...m, title, markdown, body, faqs, domains };
}

export const GUIDES: Guide[] = META.map(parse);
export const guideUrl = (g: Guide) => `${SITE}/guides/${g.slug}/`;
export const guidesForDomain = (domain: string) => GUIDES.filter((g) => g.domains.includes(domain));
