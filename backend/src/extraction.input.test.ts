import { describe, it, expect } from "vitest";
import {
  buildModelInput,
  enforceTrainingOptOut,
  isTrainingOptOutClause,
  HEAD_CHARS,
  MAX_INPUT_CHARS,
  parseModelJson,
  repairJson,
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

describe("training opt-out: 24 Oct dry-run cases", () => {
  it("counts an opt-out by emailing support (HeyGen, Kimi)", () => {
    expect(isTrainingOptOutClause("You may request to opt-out of this training and enhancement by contacting us at privacy@heygen.com.")).toBe(true);
    expect(isTrainingOptOutClause("If you do not want your conversation data to be used for training, you can contact customer support at x@kimi.com and submit a request.")).toBe(true);
  });

  it("uses the heading / previous sentence for training context (ElevenLabs, Photoroom)", () => {
    const src = "Opt out of training: You can opt out of our use of your personal information at any time in Data use.";
    expect(isTrainingOptOutClause("You can opt out of our use of your personal information at any time in Data use.", src)).toBe(true);
    const pr = "you authorize Photoroom to use User Content to improve, train and develop products. You can opt-out of this at any time under Data Control.";
    expect(isTrainingOptOutClause("You can opt-out of this at any time under Data Control.", pr)).toBe(true);
    expect(isTrainingOptOutClause("You can opt-out of this at any time under Data Control.")).toBe(false);
  });

  it("context never rescues an excluded mechanism", () => {
    const src = "We train models on your data. You can opt out of marketing emails at any time.";
    expect(isTrainingOptOutClause("You can opt out of marketing emails at any time.", src)).toBe(false);
  });

  it("doesn't-train plus a real training opt-out becomes null (Zapier) -> unrated", () => {
    const f = enforceTrainingOptOut(
      { ...trains, trains_on_user_data: false },
      "Enterprise customers are automatically opted out of Zapier using their content for model training and improvement purposes. All other customers may opt out at any time.",
    );
    expect(f.trains_on_user_data).toBeNull();
    expect(computeVerdict(f)).toBe("unrated");
  });
});

describe("parseModelJson", () => {
  it("parses fenced JSON with trailing prose", () => {
    expect(parseModelJson('```json\n{"a": [1, "x"]}\n```\nDone.')).toEqual({ a: [1, "x"] });
  });
  it("repairs unescaped quotes inside a clause string", () => {
    const bad = '{"relevant_clauses": ["you can opt out by turning off "Improve the model for everyone".", "b"], "x": "say "hi" now"}';
    expect(parseModelJson(bad)).toEqual({ relevant_clauses: ['you can opt out by turning off "Improve the model for everyone".', "b"], x: 'say "hi" now' });
  });
  it("leaves valid escapes alone", () => {
    expect(repairJson('{"a": "q \\" e \\\\ z"}')).toBe('{"a": "q \\" e \\\\ z"}');
  });
  it("still fails honestly with no object", () => {
    expect(() => parseModelJson("no json")).toThrow(/no_json_object_in_response/);
  });
});

describe("training opt-out context matching", () => {
  it("finds the clause despite space-before-period and curly quotes (Mistral)", () => {
    const src = "may be included in Mistral\u2019s model training programs . \uD83D\uDD11 You retain full control over this processing and have the right to opt out of these programs at any time . The opt-out";
    expect(isTrainingOptOutClause("You retain full control over this processing and have the right to opt out of these programs at any time.", src)).toBe(true);
  });
});

describe("training opt-out: held-tool false positives", () => {
  it("Mailchimp: 'select preferences' is not an opt-out", () => {
    expect(isTrainingOptOutClause("You may select preferences about your data by visiting your account settings.", "We may use your Inputs for machine learning purposes. You may select preferences about your data by visiting your account settings.")).toBe(false);
  });
  it("Kling: revoking the content licence is not a training opt-out", () => {
    expect(isTrainingOptOutClause("If you do not wish us to continue using all or part of the Content, you may notify us to revoke the authorization by sending an email to support@kling.ai.", "(f) train models. 4.7.4 If you do not wish us to continue using all or part of the Content, you may notify us to revoke the authorization by sending an email to support@kling.ai.")).toBe(false);
  });
  it("only the immediately preceding sentence gives training context", () => {
    const src = "We train models on your data. We send invoices monthly. You can opt out at any time.";
    expect(isTrainingOptOutClause("You can opt out at any time.", src)).toBe(false);
  });
});
