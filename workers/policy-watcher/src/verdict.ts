// Verdict step used only when Task 2 detected a wording change.
// Two independent model calls: the second prompt sees only the source text
// (and optional diff), never the first call's output or reasoning.
// Callers inject the model. Tests must mock it — no live model calls in tests.
import type { VerdictDirection } from "./gate";

export interface ModelMessage {
  role: "system" | "user";
  content: string;
}

export type ModelClient = (messages: ModelMessage[]) => Promise<string>;

export const FIRST_SYSTEM_PROMPT = `You are checking whether a vendor's published policy still supports a training-on-user-data verdict.
Read only the source text (and diff if given). Reply with a single JSON object, no markdown:
{"direction":"doesnt_train|trains_opt_out|trains_no_opt_out|policy_unclear|company_wide|not_ai_tool","quotes":["verbatim quote", "..."],"notes":"short"}
direction must be one of those six values. quotes must be copied word-for-word from the source text.`;

export const SECOND_SYSTEM_PROMPT = `You are giving a second, independent opinion on a vendor's published policy.
You must not assume any earlier verdict. Read only the source text (and diff if given). Reply with a single JSON object, no markdown:
{"direction":"doesnt_train|trains_opt_out|trains_no_opt_out|policy_unclear|company_wide|not_ai_tool","quotes":["verbatim quote", "..."]}
direction must be one of those six values. quotes must be copied word-for-word from the source text.`;

const DIRECTIONS = new Set([
  "doesnt_train",
  "trains_opt_out",
  "trains_no_opt_out",
  "policy_unclear",
  "company_wide",
  "not_ai_tool",
]);

export interface Opinion {
  direction: VerdictDirection;
  quotes: string[];
  raw: string;
}

function userPayload(sourceText: string, diff?: string): string {
  const parts = ["SOURCE TEXT:", sourceText.slice(0, 100_000)];
  if (diff && diff.trim()) parts.push("", "DIFF (previous vs current):", diff.slice(0, 20_000));
  return parts.join("\n");
}

export function parseOpinion(raw: string): Opinion | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(trimmed.slice(start, end + 1)) as { direction?: string; quotes?: unknown };
    if (!j.direction || !DIRECTIONS.has(j.direction)) return null;
    const quotes = Array.isArray(j.quotes) ? j.quotes.filter((q): q is string => typeof q === "string" && q.trim().length > 0) : [];
    return { direction: j.direction as VerdictDirection, quotes, raw };
  } catch {
    return null;
  }
}

export async function firstOpinion(model: ModelClient, sourceText: string, diff?: string): Promise<Opinion> {
  const raw = await model([
    { role: "system", content: FIRST_SYSTEM_PROMPT },
    { role: "user", content: userPayload(sourceText, diff) },
  ]);
  const parsed = parseOpinion(raw);
  if (!parsed) throw new Error("first_opinion_unparseable");
  return parsed;
}

export async function secondOpinion(model: ModelClient, sourceText: string, diff?: string): Promise<Opinion> {
  const raw = await model([
    { role: "system", content: SECOND_SYSTEM_PROMPT },
    { role: "user", content: userPayload(sourceText, diff) },
  ]);
  const parsed = parseOpinion(raw);
  if (!parsed) throw new Error("second_opinion_unparseable");
  return parsed;
}

/** Run both opinions as separate calls. The second call is given only source/diff. */
export async function independentOpinions(
  first: ModelClient,
  second: ModelClient,
  sourceText: string,
  diff?: string
): Promise<{ first: Opinion; second: Opinion }> {
  const a = await firstOpinion(first, sourceText, diff);
  const b = await secondOpinion(second, sourceText, diff);
  return { first: a, second: b };
}
