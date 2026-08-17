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

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You extract factual data-handling claims from privacy policy text. Output ONLY facts stated in the text, never a compliance judgment or verdict. Respond with strict JSON matching this shape:
{
  "trains_on_user_data": true | false | null,
  "data_retention": string | null,
  "gdpr_mentioned": true | false | null,
  "opt_out_available": true | false | null,
  "relevant_clauses": string[]
}
Use null where the text does not state something. relevant_clauses should be short direct quotes (max ~200 chars each) supporting the other fields. Respond with JSON only, no prose.`;

export async function extractFacts(rawText: string, apiKey: string): Promise<ExtractedFacts> {
  const truncated = rawText.slice(0, 15_000);

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
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no_json_object_in_response");
  }
  const jsonSlice = text.slice(start, end + 1);

  const parsed = JSON.parse(jsonSlice) as ExtractedFacts;
  return {
    trains_on_user_data: parsed.trains_on_user_data ?? null,
    data_retention: parsed.data_retention ?? null,
    gdpr_mentioned: parsed.gdpr_mentioned ?? null,
    opt_out_available: parsed.opt_out_available ?? null,
    relevant_clauses: Array.isArray(parsed.relevant_clauses) ? parsed.relevant_clauses : [],
  };
}
