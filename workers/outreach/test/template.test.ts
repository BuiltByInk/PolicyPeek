import { describe, expect, it } from "vitest";
import { assertNoBanned, PRIVACY_URL, QUESTIONS, renderFollowup, renderInitial, sanitiseHeaderText, STOP_LINE, TemplateError } from "../src/template";

const base = {
  toolName: "Example Tool",
  policyUrl: "https://example.com/privacy",
  storedPolicyUrl: "https://example.com/privacy",
  contextParagraph: "We reviewed your Privacy Policy (Updated: 1 June 2026). It does not say whether customer data is used to train AI models.",
};

describe("gate 1: templates", () => {
  it("initial: from PolicyPeek, free independent checker, exactly three questions, privacy link, stop line", () => {
    const e = renderInitial(base);
    expect(e.subject).toBe("PolicyPeek question: does Example Tool use customer data to train AI models?");
    expect(e.text).toContain("I run PolicyPeek (https://getpolicypeek.com), a free, independent checker");
    for (const q of QUESTIONS) expect(e.text).toContain(q);
    expect(e.text.match(/^\d\. /gm)).toHaveLength(3);
    expect(e.text).toContain(PRIVACY_URL);
    expect(e.text).toContain(STOP_LINE);
    expect(e.text).toContain("Policy we reviewed: https://example.com/privacy");
    expect(e.text).not.toMatch(/<[a-z]/i);
    assertNoBanned(e);
  });
  it("follow-up: says it's the only one, keeps the privacy link and stop line", () => {
    const e = renderFollowup({ ...base, initialSentAt: "2026-11-11T09:00:00Z" });
    expect(e.subject.startsWith("Re: PolicyPeek question:")).toBe(true);
    expect(e.text).toContain("I'm following up once on my email of 11 November 2026");
    expect(e.text).toContain("This is the only follow-up we'll send.");
    expect(e.text).toContain(PRIVACY_URL);
    expect(e.text).toContain(STOP_LINE);
    assertNoBanned(e);
  });
  it("subject sanitisation strips CR/LF/control chars and caps at 120", () => {
    expect(sanitiseHeaderText("a\r\nBcc: x@example.com\u0007b")).toBe("a Bcc: x@example.com b");
    const e = renderInitial({ ...base, toolName: "Evil\r\nBcc: victim@example.com" + "x".repeat(200) });
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.subject.length).toBeLessThanOrEqual(120);
  });
  it("policy URL must be https and exactly the stored value", () => {
    expect(() => renderInitial({ ...base, policyUrl: "http://example.com/privacy", storedPolicyUrl: "http://example.com/privacy" })).toThrow(TemplateError);
    expect(() => renderInitial({ ...base, policyUrl: "https://example.com/privacy?x=1" })).toThrow(/policy_url_mismatch/);
    expect(() => renderInitial({ ...base, policyUrl: "https://u:p@example.com/", storedPolicyUrl: "https://u:p@example.com/" })).toThrow(TemplateError);
  });
  it("context paragraph: plain text only, capped", () => {
    expect(() => renderInitial({ ...base, contextParagraph: "<a href=x>click</a>" })).toThrow(/markup/);
    expect(() => renderInitial({ ...base, contextParagraph: "x".repeat(1501) })).toThrow(/too_long/);
    expect(() => renderInitial({ ...base, contextParagraph: "  " })).toThrow(/empty/);
  });
  it("neutral: rejects wording that states or implies the company trains on data", () => {
    for (const bad of ["Since you train on customer data, please explain.", "We know you use our data for models.", "You are training models on it.", "you use customer data to improve AI", "Why do you train on user content?", "Your AI training on uploads", "Example trains on your data."])
      expect(() => assertNoBanned({ subject: "s", text: bad }), bad).toThrow(/implies_training/);
    expect(() => renderInitial({ ...base, contextParagraph: "We reviewed your policy. Since you train on customer data, how do people opt out?" })).toThrow(/implies_training/);
    // the fixed questions and a quoted vendor clause are neutral
    expect(() => renderInitial({ ...base, contextParagraph: 'We reviewed your terms. It says: "we may use User Content to train our models" We\'d like to make sure we read this correctly.' })).not.toThrow();
  });
  it("no InkLLM, sales or paid wording", () => {
    expect(() => assertNoBanned({ subject: "s", text: "Try InkLLM" })).toThrow();
    expect(() => assertNoBanned({ subject: "s", text: "our paid plan" })).toThrow();
  });
});

import { ownWords, renderInitial as ri, TemplateError as TE } from "../src/template";
describe("SF7: no verdict vocabulary in our own words", () => {
  const base = { toolName: "Acme", policyUrl: "https://acme.example/privacy", storedPolicyUrl: "https://acme.example/privacy" };
  for (const ctx of ["We reviewed your policy. Your listing is held while we check.", "Our verdict is unclear.", "We rated this not compliant.", "We found that the policy allows it.", "Your badge shows Trains on data.", "We think you train on uploads.", "We believe you use uploaded files to train models."])
    it(`rejects: ${ctx}`, () => expect(() => ri({ ...base, contextParagraph: ctx })).toThrow(TE));
  it("allows the same words inside an attributed vendor quote", () => {
    const e = ri({ ...base, contextParagraph: `We reviewed https://acme.example/privacy. It says: "Content is held for 30 days and we remain compliant with GDPR." We'd like to make sure we read this correctly.` });
    expect(e.text).toContain("held for 30 days");
    expect(ownWords(e.text)).not.toContain("held for 30 days");
  });
});
