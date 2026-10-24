// Calls Claude Haiku to pull structured FACTS out of raw policy text. This
// must never return a compliance verdict (compliant/not_compliant/unrated) —
// that's computed separately by a deterministic rules function from these
// facts. The prompt and the output schema both deliberately omit any verdict
// field so the model has nowhere to put one.

export interface ExtractedFacts {
  trains_on_user_data: boolean | null;
  data_retention: string | null;
  gdpr_mentioned: boolean | null;
  opt_out_available: boolean | null;
  relevant_clauses: string[];
}

import { cleanText } from "./textUtil";

const MAX_DATA_RETENTION_CHARS = 300;
const MAX_CLAUSE_CHARS = 500;
const MAX_CLAUSES = 10;

function boundedText(value: unknown, max: number): string | null {
  return cleanText(value, max, { ellipsis: true });
}

// The model's output is derived from an attacker-influenceable page (anyone
// can submit a domain they control), so it's untrusted input, not a schema-
// checked one. Everything downstream (rules.ts, D1 binds, tools.json, the
// site, the extension popup) assumes the shape in ExtractedFacts, so enforce
// it here: a fact that isn't a real boolean becomes null (which routes to
// human review or "unrated", never to a confident verdict), and free text is
// length-capped and stripped of control characters.
export function sanitizeFacts(parsed: unknown): ExtractedFacts {
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
  const clauses = Array.isArray(obj.relevant_clauses) ? obj.relevant_clauses : [];

  return {
    trains_on_user_data: bool(obj.trains_on_user_data),
    data_retention: boundedText(obj.data_retention, MAX_DATA_RETENTION_CHARS),
    gdpr_mentioned: bool(obj.gdpr_mentioned),
    opt_out_available: bool(obj.opt_out_available),
    relevant_clauses: clauses
      .map((c) => boundedText(c, MAX_CLAUSE_CHARS))
      .filter((c): c is string => c !== null)
      .slice(0, MAX_CLAUSES),
  };
}

const MODEL = "claude-haiku-4-5-20251001";

// ---------------------------------------------------------------------------
// Model input selection.
//
// Until 2026-10-24 we sent rawText.slice(0, 15_000). Research's re-check of the
// 13 held tools found seven whose training clause sits past character 15,000
// (Ahrefs 38.7k, Mailchimp 77.9k, Pika 40.9k, Kling 24k, Zapier 24.4k, Pictory
// 20.6k, DeepSeek 15.5k), so the model never saw it and returned null ->
// unrated. buildModelInput keeps the head of the policy (definitions, dates,
// who the controller is) and then adds context windows around training/AI
// wording found anywhere in the text, merged where they overlap, under a hard
// total cap. Fully deterministic: same text in, same string out.
// ---------------------------------------------------------------------------

export const HEAD_CHARS = 6_000;
export const WINDOW_BEFORE = 700;
export const WINDOW_AFTER = 900;
export const MAX_INPUT_CHARS = 24_000;
const GAP_MARKER = "\n[...]\n";

// Strong terms are almost always about AI training; weak ones are noisy
// ("model" years, "AI" in unrelated acronyms, "opt out" of marketing) and only
// fill budget left over after every strong window is in.
const STRONG_TERMS = /\b(?:train(?:s|ed|ing)?|fine-?tun\w*|machine[- ]learning|artificial intelligence|large language models?|LLMs?|neural network\w*|generative ai)\b/gi;
const WEAK_TERMS = /\b(?:models?|AI|opt(?:-| )?out|improve (?:and develop )?(?:our|the) (?:services?|products?|technology|model))\b/g;

interface Win {
  start: number;
  end: number;
}

function matchWindows(text: string, re: RegExp): Win[] {
  const out: Win[] = [];
  re.lastIndex = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index < HEAD_CHARS) continue; // already in the head
    out.push({ start: Math.max(HEAD_CHARS, m.index - WINDOW_BEFORE), end: Math.min(text.length, m.index + m[0].length + WINDOW_AFTER) });
  }
  return out;
}

function mergeWindows(wins: Win[]): Win[] {
  const sorted = [...wins].sort((a, b) => a.start - b.start);
  const merged: Win[] = [];
  for (const w of sorted) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  return merged;
}

function size(wins: Win[]): number {
  return wins.reduce((n, w) => n + (w.end - w.start) + GAP_MARKER.length, 0);
}

export function buildModelInput(rawText: string): string {
  if (rawText.length <= MAX_INPUT_CHARS) return rawText;

  const budget = MAX_INPUT_CHARS - HEAD_CHARS;
  let selected: Win[] = [];

  // Add windows one by one (strong first, each tier in document order) and
  // keep one only if the merged selection still fits the budget.
  for (const tier of [matchWindows(rawText, STRONG_TERMS), matchWindows(rawText, WEAK_TERMS)]) {
    for (const w of tier) {
      const candidate = mergeWindows([...selected, w]);
      if (size(candidate) <= budget) selected = candidate;
    }
  }

  let out = rawText.slice(0, HEAD_CHARS);
  for (const w of selected) out += GAP_MARKER + rawText.slice(w.start, w.end);
  return out;
}

// ---------------------------------------------------------------------------
// Training opt-out enforcement.
//
// opt_out_available must mean "the user can opt out of their data being used
// to train AI/ML models". The pipeline used to set it from any opt-out
// (marketing email, cookies, Google Analytics, GDPR consent withdrawal), which
// turned Suno and Remove.bg into compliant_with_caveats. The prompt now asks
// for the exact opt-out sentence, and enforceTrainingOptOut only keeps
// opt_out_available === true when that sentence is about training and isn't
// one of the excluded mechanisms. Anything else becomes false.
// ---------------------------------------------------------------------------

const TRAINING_VOCAB = /\b(?:train\w*|fine-?tun\w*|machine[- ]learning|artificial intelligence|AI|models?|LLMs?|improve the model)\b/i;
const EXCLUDED_OPT_OUT = [
  /\b(?:delet\w*|eras\w*|remov\w*)\b[^.]{0,80}\b(?:data|content|account|information)\b/i, // deleting your data
  /\b(?:clos\w*|terminat\w*|cancel\w*)\b[^.]{0,40}\baccount\b/i, // closing your account
  /\bcookies?\b|\bbrowser settings?\b/i,
  /\b(?:marketing|newsletters?|promotional)\b/i,
  /\breceiv\w*\b[^.]{0,40}\b(?:communications|e-?mails?|messages)\b/i,
  /\b(?:analytics|advertis\w*|targeted ads|ad personali[sz]ation|interest-based)\b/i,
  /\b(?:sale|sell(?:ing)?|shar(?:e|ing))\b[^.]{0,60}\bpersonal (?:data|information)\b/i, // CCPA
  /\bwithdraw\w*\b[^.]{0,30}\bconsent\b/i,
  /\bright to object\b/i,
  /\brevok\w*\b[^.]{0,40}\b(?:authori[sz]ation|licen[cs]e|consent|permission)\b/i, // revoking a content licence (Kling)
];

// The clause must actually describe a way to stop: "select preferences about
// your data" (Mailchimp) is not an opt-out.
const OPT_OUT_ACTION = /\b(?:opt(?:-| )?(?:s|ed|ing)? ?out|opted out|turn(?:ing)? off|disabl\w*|deselect\w*|switch(?:ing)? off|toggle|do not want|don't want|stop using|exclude|enabl\w*|decide whether|choose whether|(?:training|data) controls?|privacy mode)\b/i;

// The opt-out sentence often relies on its heading or the sentence before for
// the "training" part ("Opt out of training: You can opt out of our use of
// your personal information..."; "You can opt-out of this at any time..."), so
// the training-vocabulary test also looks at the sentence immediately before
// the clause in the source text (at most CONTEXT_BEFORE characters), when the
// clause is found there. The exclusion and action tests look at the clause only.
const CONTEXT_BEFORE = 300;

// Pages often differ from the model's quote only in whitespace before
// punctuation ("at any time .") or curly vs straight quotes (Mistral).
const norm = (s: string) =>
  s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export function isTrainingOptOutClause(clause: string | null | undefined, sourceText?: string): boolean {
  if (!clause || !clause.trim()) return false;
  if (EXCLUDED_OPT_OUT.some((re) => re.test(clause))) return false;
  if (!OPT_OUT_ACTION.test(clause)) return false;
  if (TRAINING_VOCAB.test(clause)) return true;
  if (!sourceText) return false;
  const src = norm(sourceText);
  const q = norm(clause);
  let at = src.indexOf(q);
  if (at === -1) at = src.indexOf(q.slice(0, 60)); // quote trimmed or lightly paraphrased at the end
  if (at === -1) return false;
  // Drop trailing non-text (emoji bullets, list markers) first (Mistral: "programs. 🔑 You retain").
  const before = src.slice(Math.max(0, at - CONTEXT_BEFORE), at).replace(/[^\p{L}\p{N}.!?:)"']+$/u, "");
  // Previous sentence only: cut at the last sentence end before the one that
  // closes it (headings like "Opt out of training:" have no period).
  const body = before.replace(/[.!?]$/, "");
  const prevSentence = body.slice(Math.max(body.lastIndexOf(". "), body.lastIndexOf("? "), body.lastIndexOf("! ")) + 1);
  return TRAINING_VOCAB.test(prevSentence);
}

export function enforceTrainingOptOut(facts: ExtractedFacts, optOutClause: unknown, sourceText?: string): ExtractedFacts {
  if (facts.opt_out_available !== true) return facts;
  const clause = typeof optOutClause === "string" ? optOutClause : null;
  if (!isTrainingOptOutClause(clause, sourceText)) return { ...facts, opt_out_available: false };
  // "Doesn't train" plus a real training opt-out contradicts itself (Zapier:
  // enterprise opted out automatically, everyone else "may opt out"). Don't
  // guess the default: null routes to unrated / human review.
  if (facts.trains_on_user_data === false) return { ...facts, trains_on_user_data: null };
  return facts;
}

// Haiku sometimes leaves a double quote unescaped inside a quoted clause
// (e.g. turning off "Improve the model for everyone"), which made JSON.parse
// fail for deepl.com and runway.com in the 24 Oct regression. repairJson
// escapes any '"' inside a string that isn't followed by a JSON delimiter.
export function repairJson(json: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (!inStr) {
      if (c === '"') inStr = true;
      out += c;
      continue;
    }
    if (c === "\\") {
      out += c + (json[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === '"') {
      const next = json.slice(i + 1).match(/^\s*(.)/)?.[1];
      if (next === undefined || ",:}]".includes(next)) {
        inStr = false;
        out += c;
      } else out += '\\"';
      continue;
    }
    out += c;
  }
  return out;
}

export function parseModelJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no_json_object_in_response");
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return JSON.parse(repairJson(slice));
  }
}

export const SYSTEM_PROMPT = `You extract factual data-handling claims from privacy policy or terms text. Output ONLY facts stated in the text, never a compliance judgment or verdict. The text may be excerpts joined by "[...]": the start of the document plus passages around AI/training wording.
Respond with strict JSON matching this shape:
{
  "trains_on_user_data": true | false | null,
  "data_retention": string | null,
  "gdpr_mentioned": true | false | null,
  "opt_out_available": true | false | null,
  "opt_out_clause": string | null,
  "relevant_clauses": string[]
}
Rules:
- trains_on_user_data: whether user data/content/inputs are used to train, fine-tune or improve AI or machine-learning models. null if the text does not say.
- opt_out_available: true ONLY if the text describes a way for the user to opt out of, or turn off, use of their data for AI/model training. These do NOT count and must give false: opting out of marketing or emails, cookie or browser settings, analytics, ad personalisation, sale/sharing of personal information (e.g. CCPA), a general right to withdraw consent or to object, deleting data, or closing an account. If training is opt-in or off by default, set trains_on_user_data false.
- opt_out_clause: the exact sentence describing the training opt-out, copied verbatim, or null.
- Use null where the text does not state something. relevant_clauses should be short direct quotes (max ~200 chars each) supporting the other fields, training clauses first.
Respond with JSON only, no prose.`;

export async function extractFacts(rawText: string, apiKey: string): Promise<ExtractedFacts> {
  const truncated = buildModelInput(rawText);

  // A client-rendered SPA (confirmed real case: Character.AI) fetches fine
  // but cleanHtmlToText strips it down to nothing real -- sending that to
  // Haiku produces "messages.0: user messages must have non-empty content",
  // an opaque 400 that looks like an API bug rather than what it actually
  // is: we never had real policy text to extract from. Fail with an honest
  // reason instead of making the API call at all.
  if (truncated.trim().length === 0) {
    throw new Error("empty_extracted_text -- fetched page produced no usable text after HTML cleaning (likely a client-rendered page)");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: truncated }],
    }),
  });

  if (!res.ok) {
    throw new Error(`anthropic_api_${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("no_text_content_in_response");

  // Haiku doesn't always respond with pure JSON despite the system prompt
  // saying to -- markdown fences and trailing prose after the closing brace
  // both show up in practice. Extract the outermost {...} object rather than
  // trusting the response to be parseable as-is.
  const parsed = parseModelJson(text);
  const optOutClause = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).opt_out_clause : null;

  return enforceTrainingOptOut(sanitizeFacts(parsed), optOutClause, truncated);
}
