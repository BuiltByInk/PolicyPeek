import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeDb } from "../../test-utils/d1shim";
import {
  collapseWs,
  directionFromStatus,
  evaluateChangeGate,
  quoteAppearsVerbatim,
  type GateInput,
} from "../src/gate";
import { listHit } from "../src/heldLists";
import { evaluateChanged, evaluateUnchanged, type CardSnapshot } from "../src/evaluateChange";
import { parseOpinion, FIRST_SYSTEM_PROMPT, SECOND_SYSTEM_PROMPT, type ModelClient } from "../src/verdict";
import { FAILURE_FLAG_THRESHOLD, recordHealth } from "../src/health";
import type { Result } from "../src/watch";

const MIG = new URL("../migrations/0001_watcher.sql", import.meta.url).pathname;
const MIG2 = new URL("../migrations/0002_gate_and_queue.sql", import.meta.url).pathname;

const text = "We do not use your content to train models. You can also read the terms.";
const quote = "We do not use your content to train models.";

const base = (over: Partial<GateInput> = {}): GateInput => ({
  toolSlug: "example.com",
  fetchedText: text,
  oldDirection: "doesnt_train",
  newDirection: "doesnt_train",
  reliedOnQuotes: [quote],
  firstOpinion: "doesnt_train",
  secondOpinion: "doesnt_train",
  ...over,
});

describe("quoteAppearsVerbatim", () => {
  it("matches word-for-word, including across collapsed whitespace", () => {
    expect(quoteAppearsVerbatim(quote, text)).toBe(true);
    expect(quoteAppearsVerbatim("We do not use your content to train models.", "We do not  use\nyour content to train models.")).toBe(true);
    expect(quoteAppearsVerbatim("We do not use your content to train models.", "We may use your content to train models.")).toBe(false);
    expect(quoteAppearsVerbatim("", text)).toBe(false);
    expect(collapseWs("a \n b")).toBe("a b");
  });
});

describe("evaluateChangeGate paths", () => {
  it("publishes only when every rule passes", () => {
    const r = evaluateChangeGate(base());
    expect(r).toMatchObject({ publish: true, reasons: [], missingQuotes: [], directionChanged: false, listHit: null });
  });

  it("fails when a relied-on quote is not in the fetched text", () => {
    const r = evaluateChangeGate(base({ reliedOnQuotes: [quote, "You may opt out in Settings."] }));
    expect(r.publish).toBe(false);
    expect(r.reasons).toEqual(["quote_not_verbatim"]);
    expect(r.missingQuotes).toEqual(["You may opt out in Settings."]);
  });

  it("fails when the verdict direction changes, even if wording is clear and opinions agree", () => {
    const r = evaluateChangeGate(base({ newDirection: "trains_opt_out", firstOpinion: "trains_opt_out", secondOpinion: "trains_opt_out" }));
    expect(r.publish).toBe(false);
    expect(r.reasons).toEqual(["direction_changed"]);
    expect(r.directionChanged).toBe(true);
  });

  it("fails when the second opinion disagrees, or disagrees with the first direction", () => {
    expect(evaluateChangeGate(base({ secondOpinion: "policy_unclear" })).reasons).toEqual(["second_opinion_disagree"]);
    expect(evaluateChangeGate(base({ newDirection: "doesnt_train", firstOpinion: "trains_opt_out", secondOpinion: "trains_opt_out" })).reasons).toContain("second_opinion_disagree");
  });

  it("fails for held, recheck and medium-flag tools from file 02", () => {
    expect(listHit("mailchimp.com")).toBe("held");
    expect(listHit("cursor.com")).toBe("recheck");
    expect(listHit("claude.com")).toBe("medium_flag");
    expect(listHit("openai.com")).toBe("medium_flag");
    expect(listHit("granola.ai")).toBeNull();
    expect(evaluateChangeGate(base({ toolSlug: "mailchimp.com" })).reasons).toEqual(["held"]);
    expect(evaluateChangeGate(base({ toolSlug: "cursor.com" })).reasons).toEqual(["recheck"]);
    expect(evaluateChangeGate(base({ toolSlug: "claude.com" })).reasons).toEqual(["medium_flag"]);
  });

  it("collects every failed reason together", () => {
    const r = evaluateChangeGate(base({
      toolSlug: "mailchimp.com",
      newDirection: "policy_unclear",
      firstOpinion: "policy_unclear",
      secondOpinion: "doesnt_train",
      reliedOnQuotes: ["this quote is not on the page"],
    }));
    expect(r.publish).toBe(false);
    expect(r.reasons).toEqual(["quote_not_verbatim", "direction_changed", "second_opinion_disagree", "held"]);
  });

  it("maps catalog statuses onto the four (plus two) directions", () => {
    expect(directionFromStatus("compliant")).toBe("doesnt_train");
    expect(directionFromStatus("compliant_with_caveats")).toBe("trains_opt_out");
    expect(directionFromStatus("not_compliant")).toBe("trains_no_opt_out");
    expect(directionFromStatus("unrated")).toBe("policy_unclear");
    expect(directionFromStatus("shared_domain_unverified")).toBe("company_wide");
    expect(directionFromStatus("not_ai_tool")).toBe("not_ai_tool");
  });
});

describe("independent second opinion + evaluateChange", () => {
  const card: CardSnapshot = {
    toolSlug: "example.com",
    toolName: "Example",
    policyUrl: "https://example.com/privacy",
    oldDirection: "doesnt_train",
    oldQuote: quote,
  };
  let env: { DB: D1Database; raw: any };

  beforeEach(() => {
    const db = makeDb(MIG, MIG2);
    env = { DB: db.d1, raw: db.raw };
  });

  const model = (direction: string, quotes: string[] = [quote]): ModelClient =>
    vi.fn(async () => JSON.stringify({ direction, quotes }));

  it("makes no model call when nothing changed", async () => {
    const m = model("doesnt_train");
    const r = await evaluateUnchanged(env, card, new Date("2026-11-13T12:00:00Z"));
    expect(r.modelCalled).toBe(false);
    expect(r.queued).toBe(false);
    expect(m).not.toHaveBeenCalled();
    expect(env.raw.prepare("SELECT COUNT(*) n FROM elliot_queue").get().n).toBe(0);
  });

  it("on a wording-only change, two separate calls, second never sees the first output, then publishes", async () => {
    const seen: string[][] = [];
    const first: ModelClient = vi.fn(async (msgs) => {
      seen.push(msgs.map((m: { content: string }) => m.content));
      return JSON.stringify({ direction: "doesnt_train", quotes: [quote], notes: "FIRST_SECRET_REASONING" });
    });
    const second: ModelClient = vi.fn(async (msgs) => {
      seen.push(msgs.map((m: { content: string }) => m.content));
      return JSON.stringify({ direction: "doesnt_train", quotes: [quote] });
    });
    const r = await evaluateChanged(env, card, text, "- old\n+ new", first, second, new Date("2026-11-13T12:00:00Z"));
    expect(r).toMatchObject({ modelCalled: true, publish: true, queued: false, reasons: [] });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(seen[0][0]).toBe(FIRST_SYSTEM_PROMPT);
    expect(seen[1][0]).toBe(SECOND_SYSTEM_PROMPT);
    expect(seen[1].join("\n")).not.toContain("FIRST_SECRET_REASONING");
    expect(seen[1].join("\n")).not.toContain("notes");
    expect(env.raw.prepare("SELECT COUNT(*) n FROM proposed_publishes").get().n).toBe(1);
    expect(env.raw.prepare("SELECT publishable, verdict_direction_changed FROM change_log").get()).toMatchObject({ publishable: 1, verdict_direction_changed: 0 });
  });

  it("queues when the second opinion disagrees, and records old/new quotes", async () => {
    const r = await evaluateChanged(
      env,
      card,
      text,
      undefined,
      model("doesnt_train"),
      model("policy_unclear", []),
      new Date("2026-11-13T12:00:00Z")
    );
    expect(r.publish).toBe(false);
    expect(r.queued).toBe(true);
    expect(r.reasons).toContain("second_opinion_disagree");
    const row = env.raw.prepare("SELECT * FROM elliot_queue").get();
    expect(row).toMatchObject({ tool_slug: "example.com", old_quote: quote, suggested_verdict: "doesnt_train", failed_reason: "second_opinion_disagree" });
  });

  it("a direction change always goes to the queue and is not publishable on /changes/ until Elliot approves", async () => {
    const r = await evaluateChanged(
      env,
      card,
      text.replace("do not use", "use") + " You can opt out in settings.",
      undefined,
      model("trains_opt_out", ["You can opt out in settings."]),
      model("trains_opt_out", ["You can opt out in settings."]),
      new Date("2026-11-13T12:00:00Z")
    );
    expect(r.reasons).toContain("direction_changed");
    expect(r.queued).toBe(true);
    const log = env.raw.prepare("SELECT * FROM change_log").get();
    expect(log).toMatchObject({ verdict_direction_changed: 1, elliot_approved: 0, publishable: 0 });
    expect(env.raw.prepare("SELECT COUNT(*) n FROM proposed_publishes").get().n).toBe(0);
  });
});

describe("parseOpinion", () => {
  it("accepts a bare JSON object and rejects a bad direction", () => {
    expect(parseOpinion('{"direction":"doesnt_train","quotes":["x"]}')?.direction).toBe("doesnt_train");
    expect(parseOpinion("here is\n```json\n{\"direction\":\"trains_opt_out\",\"quotes\":[]}\n```")).toMatchObject({ direction: "trains_opt_out" });
    expect(parseOpinion('{"direction":"banana"}')).toBeNull();
  });
});

describe("consecutive fetch failures", () => {
  it("resets on success, and flags Elliot's queue at 3 failures, once", async () => {
    const db = makeDb(MIG, MIG2);
    db.raw.prepare("INSERT INTO watch_targets (tool_slug, policy_url, pinned_host) VALUES ('example.com','https://example.com/privacy','example.com')").run();
    const fail: Result = { tool_slug: "example.com", policy_url: "https://example.com/privacy", status: "failed", reason: "http_403", http_status: 403 };
    const ok: Result = { tool_slug: "example.com", policy_url: "https://example.com/privacy", status: "ok_unchanged" };
    const now = new Date("2026-11-13T12:00:00Z");
    expect((await recordHealth({ DB: db.d1 }, fail, now)).consecutive).toBe(1);
    expect((await recordHealth({ DB: db.d1 }, ok, now)).consecutive).toBe(0);
    expect((await recordHealth({ DB: db.d1 }, fail, now)).flagged).toBe(false);
    expect((await recordHealth({ DB: db.d1 }, fail, now)).flagged).toBe(false);
    const third = await recordHealth({ DB: db.d1 }, fail, now);
    expect(third).toMatchObject({ consecutive: FAILURE_FLAG_THRESHOLD, flagged: true });
    expect(db.raw.prepare("SELECT COUNT(*) n FROM elliot_queue WHERE failed_reason = 'fetch_failed_3x'").get().n).toBe(1);
    await recordHealth({ DB: db.d1 }, fail, now); // still 4, no second open row
    expect(db.raw.prepare("SELECT COUNT(*) n FROM elliot_queue").get().n).toBe(1);
  });
});
