// Guides (/guides/): long-form answers built from src/guides/*.md. The same
// Markdown is rendered as HTML at /guides/<slug>/ and served as-is at
// /guides/<slug>.md for AI agents and scrapers. Update `modified` together with
// the "Last checked" line inside the Markdown whenever the data changes.
const raw = import.meta.glob<string>("./guides/*.md", { query: "?raw", import: "default", eager: true });

export const SITE = "https://getpolicypeek.com";

// seoTitle: the <title> (before " · PolicyPeek"). The H1 in the Markdown can be
// longer; the full <title> must stay at or under 60 characters (SEO health
// check, 2026-11-04), which tests/guides.test.mjs enforces.
interface Meta { slug: string; seoTitle: string; description: string; published: string; modified: string }
// Order = priority on the /guides/ index and in llms.txt.
const META: Meta[] = [
  { slug: "do-uk-small-businesses-need-an-ai-policy", seoTitle: "Do UK Small Businesses Need an AI Policy?", description: "No UK law requires a standalone AI policy, but UK GDPR and the EU AI Act's AI literacy duty can apply. What a small-business AI policy should cover." },
  { slug: "eu-ai-act-article-4-ai-literacy-small-uk-business", seoTitle: "EU AI Act Article 4 for Small UK Businesses", description: "What EU AI Act Article 4 (AI literacy) means for a 10-person UK business using ChatGPT: who it applies to, enforcement from 2 Aug 2026, and six practical steps." },
  { slug: "is-it-safe-to-put-customer-data-into-chatgpt-uk-gdpr", seoTitle: "Customer Data in ChatGPT: UK GDPR Guide", description: "Can a UK small business paste customer data into ChatGPT? What UK GDPR and the ICO say, how plans differ on training, and what to do if it happened." },
  { slug: "ai-acceptable-use-policy-template-small-business-uk", seoTitle: "AI Acceptable Use Policy Template (UK)", description: "A free AI acceptable use policy outline for UK small businesses: approved tools, what staff must never enter, checking output and training. Checked Oct 2026." },
  { slug: "how-to-train-staff-on-ai-30-minute-session", seoTitle: "How to Train Staff on AI in 30 Minutes", description: "A ready-to-run 30-minute AI training session for small teams, with agenda, hallucination demo and training record. Fits the EU AI Act Article 4 duty." },
  { slug: "free-ai-privacy-policy-checker", seoTitle: "Free AI Privacy Policy Checker", description: "PolicyPeek is a free checker that reads AI tools' own privacy policies and terms and tells you, in one badge, whether they train on your data. 61 tools checked." },
  { slug: "how-to-check-if-an-app-trains-ai-on-your-data", seoTitle: "How to Check If an App Trains AI on Your Data", description: "Find out in two minutes whether an app uses your data to train AI: where to look in its policy, the exact phrases that matter, and a free checker." },
  { slug: "chatgpt-vs-claude-training", seoTitle: "ChatGPT vs Claude: Which Trains on Your Chats?", description: "ChatGPT vs Claude on AI training: both train on your chats by default and both let you opt out. Exact policy quotes, sources and check dates.", published: "2026-11-04", modified: "2026-11-04" },
  { slug: "does-chatgpt-train-on-your-data", seoTitle: "Does ChatGPT Train on Your Data?", description: "Does ChatGPT train on your data? Yes, by default, but OpenAI's own policy says you can opt out. Here's the exact wording, plus how other AI tools compare." },
  { slug: "ai-tools-that-dont-train-on-your-data-uk", seoTitle: "AI Tools That Don't Train on Your Data (UK)", description: "15 AI tools whose own privacy policies say they don't train on your data, from Abacus.AI to Zoom, plus how ChatGPT and Claude compare. Checked Nov 2026.", modified: "2026-11-04" },
  { slug: "ai-tools-that-train-on-your-data-no-opt-out", seoTitle: "AI Tools That Train on Your Data, No Opt-Out", description: "13 AI tools whose own policies let them train on your content with no confirmed training opt-out, from Ahrefs to Suno. Quotes and sources, checked Nov 2026." },
  { slug: "does-mailchimp-use-your-data-for-ai-training", seoTitle: "Does Mailchimp Use Your Data for AI Training?", description: "Mailchimp's terms allow machine-learning use of your data. The Data analytics setting is not a confirmed training opt-out. How HubSpot and Ahrefs compare." },
  { slug: "ai-meeting-note-takers-that-dont-train-on-your-data", seoTitle: "Do AI Note-Takers Train on Your Recordings?", description: "Which AI note-takers train on your recordings and how to opt out. Zoom, Fireflies and tl;dv say they don't; Granola and Otter let you opt out.", modified: "2026-11-04" },
  { slug: "do-ai-coding-assistants-train-on-your-code", seoTitle: "Do AI Coding Assistants Train on Your Code?", description: "Which AI coding tools train on your code: Tabnine and Cody say no, Cursor, Copilot and Windsurf let you opt out, Base44 has none." },
  { slug: "how-to-opt-out-of-ai-training-image-video-music-tools", seoTitle: "How to Opt Out of AI Training: Creative Tools", description: "Which AI image, video, voice and music tools train on your uploads, which let you opt out, and how. Suno, Pika, ElevenLabs, Photoroom and more." },
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
  // The "Last checked" line sits under the opening answer (answer first), so
  // strip it wherever it is.
  const body = lines.slice(1).join("\n").replace(/^\*Last checked:[^\n]*\*[ \t]*\n?/m, "").replace(/\n{3,}/g, "\n\n").trim();
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
