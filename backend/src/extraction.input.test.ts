import { describe, it, expect } from "vitest";
import {
  buildModelInput,
  enforceTrainingOptOut,
  isTrainingOptOutClause,
  HEAD_CHARS,
  MAX_INPUT_CHARS,
  type ExtractedFacts,
} from "./extraction";
import { computeVerdict } from "./rules";

import { HELD_FIXTURES } from "../test-fixtures/held";

const fixture = (name: string) => HELD_FIXTURES[name];

// Decisive clauses quoted in Research's re-check (recheck-held-2026-10-24.md),
// fetched with plain curl on 24 Oct 2026 and cleaned with cleanHtmlToText.
const DECISIVE: Record<string, string[]> = {
  deepseek: ["you can opt out by turning off"],
  ahrefs: ["to train our machine learning models"],
  mailchimp: ["for machine learning purposes in order to develop and improve the AI Model"],
  pictory: ["will not use your Customer Content or Pictoried Content to train"],
  zapier: ["All other customers may opt out at any time"],
  pika: ["to train, improve, and develop its machine learning models"],
  kling: ["create, test, improve, train, or otherwise develop"],
  suno: ["to train and enhance the models that power our Services"],
  removebg: ["to train our algorithms, models and AI products"],
  invideo: ["You can stop this use by deleting the relevant User Data"],
  buffer: ["scrape my content to train the AI"],
  poe: ["may view and store your chats on their servers to train their models"],
};

describe("buildModelInput on held-tool fixtures", () => {
  for (const [name, quotes] of Object.entries(DECISIVE)) {
    it(`${name}: decisive clause reaches the model, within the cap`, () => {
      const text = fixture(name);
      const input = buildModelInput(text);
      expect(input.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
      for (const q of quotes) {
        expect(text).toContain(q); // fixture sanity
        expect(input).toContain(q);
      }
    });
  }

  it("character.ai: still empty (client-rendered), so extraction refuses honestly", () => {
    expect(buildModelInput(fixture("characterai")).trim()).toBe("");
  });

  it("is deterministic", () => {
    const t = fixture("mailchimp");
    expect(buildModelInput(t)).toBe(buildModelInput(t));
  });
});

describe("buildModelInput mechanics", () => {
  it("sends short policies whole", () => {
    const t = "a".repeat(MAX_INPUT_CHARS);
    expect(buildModelInput(t)).toBe(t);
  });

  it("keeps the head and a late training clause, merging overlapping windows", () => {
    const filler = (n: number) => "Lorem ipsum dolor sit amet. ".repeat(Math.ceil(n / 28)).slice(0, n);
    const t = filler(40_000) + "We train our models on your content. We use it to train again." + filler(40_000);
    const out = buildModelInput(t);
    expect(out.startsWith(t.slice(0, HEAD_CHARS))).toBe(true);
    expect(out).toContain("We train our models on your content. We use it to train again.");
    expect(out.split("[...]").length).toBe(2); // two nearby hits -> one merged window
  });

  it("prefers strong training terms over noisy ones when the budget is tight", () => {
    const filler = "Lorem ipsum dolor sit amet. ".repeat(40);
    let t = "x".repeat(HEAD_CHARS);
    for (let i = 0; i < 60; i++) t += filler + `Model year ${i} AI opt out of email. `;
    t += filler + "We use your inputs for machine learning. " + filler;
    const out = buildModelInput(t);
    expect(out.length).toBeLessThanOrEqual(MAX_INPUT_CHARS);
    expect(out).toContain("We use your inputs for machine learning.");
  });
});

const trains: ExtractedFacts = {
  trains_on_user_data: true,
  data_retention: null,
  gdpr_mentioned: null,
  opt_out_available: true,
  relevant_clauses: [],
};

describe("training-only opt-out", () => {
  const counts = [
    'If you refuse to allow us to process the data in the manner described above, you can opt out by turning off "Improve the model for everyone".',
    "Enterprise customers are automatically opted out of Zapier using their content for model training and improvement purposes. All other customers may opt out at any time.",
    "You can turn off model training in Settings > Data Controls.",
  ];
  const doesNot = [
    "You can stop this use by deleting the relevant User Data or closing your account; this does not affect anything developed before deletion.",
    "You can opt out from receiving these types of communications at any time",
    "You can withdraw or modify your consent by changing the settings on your browser.",
    "You can opt-out of all Google supported analytics within the services",
    "You may opt out of the sale or sharing of your personal information.",
    "You may opt out of targeted advertising and ad personalisation.",
    "You have the right to withdraw your consent at any time.",
    "You can opt out of marketing emails.",
    "",
  ];
  for (const c of counts) it(`counts: ${c.slice(0, 50)}`, () => expect(isTrainingOptOutClause(c)).toBe(true));
  for (const c of doesNot) it(`does not count: ${c.slice(0, 50) || "(empty)"}`, () => expect(isTrainingOptOutClause(c)).toBe(false));

  it("downgrades a non-training opt-out so the verdict is not_compliant", () => {
    const f = enforceTrainingOptOut(trains, "You can opt out from receiving these types of communications at any time");
    expect(f.opt_out_available).toBe(false);
    expect(computeVerdict(f)).toBe("not_compliant");
  });

  it("downgrades opt_out_available=true with no quoted clause", () => {
    expect(enforceTrainingOptOut(trains, undefined).opt_out_available).toBe(false);
  });

  it("keeps a real training opt-out (caveats)", () => {
    const f = enforceTrainingOptOut(trains, counts[0]);
    expect(computeVerdict(f)).toBe("compliant_with_caveats");
  });

  it("leaves false/null untouched", () => {
    expect(enforceTrainingOptOut({ ...trains, opt_out_available: null }, null).opt_out_available).toBeNull();
    expect(enforceTrainingOptOut({ ...trains, opt_out_available: false }, null).opt_out_available).toBe(false);
  });
});
