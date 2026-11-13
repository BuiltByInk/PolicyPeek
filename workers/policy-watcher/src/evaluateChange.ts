// Orchestrates Task 3 after Task 2 reports a wording change.
// Makes no model call when nothing changed. When a change is found, runs the
// first opinion, then an independent second opinion, then the auto-publish
// gate. Failures go to elliot_queue. Passes are recorded as proposed_publishes
// and (for wording-only) as a publishable change_log row. This worker never
// writes policypeek-db or changes a live badge.
import { evaluateChangeGate, type VerdictDirection } from "./gate";
import { independentOpinions, type ModelClient, type Opinion } from "./verdict";

export interface CardSnapshot {
  toolSlug: string;
  toolName?: string;
  policyUrl: string;
  oldDirection: VerdictDirection;
  oldQuote: string | null;
}

export interface ChangeEvalEnv {
  DB: D1Database;
}

export interface ChangeEvalResult {
  toolSlug: string;
  modelCalled: boolean;
  publish: boolean;
  reasons: string[];
  suggestedVerdict: VerdictDirection | null;
  queued: boolean;
  oldQuote: string | null;
  newQuote: string | null;
}

function newQuoteFrom(op: Opinion | null, fetchedText: string): string | null {
  if (op?.quotes[0]) return op.quotes[0];
  return null;
}

export async function evaluateUnchanged(env: ChangeEvalEnv, card: CardSnapshot, now: Date): Promise<ChangeEvalResult> {
  // Recorded by the watcher as ok_unchanged. No model call, no queue row.
  void env;
  void now;
  return {
    toolSlug: card.toolSlug,
    modelCalled: false,
    publish: false,
    reasons: ["unchanged"],
    suggestedVerdict: card.oldDirection,
    queued: false,
    oldQuote: card.oldQuote,
    newQuote: card.oldQuote,
  };
}

export async function evaluateChanged(
  env: ChangeEvalEnv,
  card: CardSnapshot,
  fetchedText: string,
  diff: string | undefined,
  firstModel: ModelClient,
  secondModel: ModelClient,
  now: Date
): Promise<ChangeEvalResult> {
  let first: Opinion;
  let second: Opinion;
  try {
    const ops = await independentOpinions(firstModel, secondModel, fetchedText, diff);
    first = ops.first;
    second = ops.second;
  } catch (e) {
    const reason = (e as Error)?.message === "second_opinion_unparseable" ? "second_opinion_unparseable" : "verdict_failed";
    await enqueue(env, card, card.oldQuote, null, null, reason, now);
    return {
      toolSlug: card.toolSlug,
      modelCalled: true,
      publish: false,
      reasons: [reason],
      suggestedVerdict: null,
      queued: true,
      oldQuote: card.oldQuote,
      newQuote: null,
    };
  }

  const gate = evaluateChangeGate({
    toolSlug: card.toolSlug,
    fetchedText,
    oldDirection: card.oldDirection,
    newDirection: first.direction,
    reliedOnQuotes: first.quotes,
    secondQuotes: second.quotes,
    firstOpinion: first.direction,
    secondOpinion: second.direction,
  });
  const suggested = first.direction;
  const nq = newQuoteFrom(first, fetchedText);

  if (gate.publish) {
    await env.DB.prepare(
      "INSERT INTO proposed_publishes (created_at, tool_slug, policy_url, old_direction, new_direction, quotes_json) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(now.toISOString(), card.toolSlug, card.policyUrl, card.oldDirection, first.direction, JSON.stringify(first.quotes))
      .run();
    const summary = wordingSummary(card, first);
    await env.DB.prepare(
      "INSERT INTO change_log (detected_at, tool_slug, tool_name, policy_url, summary, verdict_direction_changed, elliot_approved, publishable) VALUES (?, ?, ?, ?, ?, 0, 0, 1)"
    )
      .bind(now.toISOString(), card.toolSlug, card.toolName ?? null, card.policyUrl, summary)
      .run();
    return {
      toolSlug: card.toolSlug,
      modelCalled: true,
      publish: true,
      reasons: [],
      suggestedVerdict: suggested,
      queued: false,
      oldQuote: card.oldQuote,
      newQuote: nq,
    };
  }

  // Direction changes that failed only because Elliot must confirm still get a
  // change_log row, but it is not publishable until elliot_approved is set.
  if (gate.directionChanged) {
    const summary = wordingSummary(card, first);
    await env.DB.prepare(
      "INSERT INTO change_log (detected_at, tool_slug, tool_name, policy_url, summary, verdict_direction_changed, elliot_approved, publishable) VALUES (?, ?, ?, ?, ?, 1, 0, 0)"
    )
      .bind(now.toISOString(), card.toolSlug, card.toolName ?? null, card.policyUrl, summary)
      .run();
  }

  const reason = gate.reasons.join(",");
  await enqueue(env, card, card.oldQuote, nq, suggested, reason, now);
  return {
    toolSlug: card.toolSlug,
    modelCalled: true,
    publish: false,
    reasons: gate.reasons,
    suggestedVerdict: suggested,
    queued: true,
    oldQuote: card.oldQuote,
    newQuote: nq,
  };
}

function wordingSummary(card: CardSnapshot, op: Opinion): string {
  const name = card.toolName || card.toolSlug;
  return `The published policy text for ${name} changed. Suggested verdict: ${op.direction.replace(/_/g, " ")}.`;
}

async function enqueue(
  env: ChangeEvalEnv,
  card: CardSnapshot,
  oldQuote: string | null,
  newQuote: string | null,
  suggested: VerdictDirection | null,
  reason: string,
  now: Date
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO elliot_queue (created_at, tool_slug, policy_url, old_quote, new_quote, suggested_verdict, failed_reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')"
  )
    .bind(now.toISOString(), card.toolSlug, card.policyUrl, oldQuote, newQuote, suggested, reason)
    .run();
}
