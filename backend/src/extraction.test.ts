import { describe, it, expect, vi } from "vitest";
import { extractFacts, sanitizeFacts } from "./extraction";

describe("extractFacts", () => {
  it("fails fast with an honest reason on empty text, without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(extractFacts("   \n\t  ", "fake-key")).rejects.toThrow(/empty_extracted_text/);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

describe("sanitizeFacts", () => {
  it("passes a well-formed extraction through unchanged", () => {
    const facts = {
      trains_on_user_data: false,
      data_retention: "30 days",
      gdpr_mentioned: true,
      opt_out_available: null,
      relevant_clauses: ["We do not train on your content."],
    };
    expect(sanitizeFacts(facts)).toEqual(facts);
  });

  it("turns non-boolean facts into null instead of trusting truthiness", () => {
    const out = sanitizeFacts({ trains_on_user_data: "false", gdpr_mentioned: 1, opt_out_available: {} });
    expect(out.trains_on_user_data).toBeNull();
    expect(out.gdpr_mentioned).toBeNull();
    expect(out.opt_out_available).toBeNull();
  });

  it("drops non-string clauses and non-string retention", () => {
    const out = sanitizeFacts({ data_retention: { days: 30 }, relevant_clauses: ["ok", 5, null, { a: 1 }, "  "] });
    expect(out.data_retention).toBeNull();
    expect(out.relevant_clauses).toEqual(["ok"]);
  });

  it("caps text length and clause count, and strips control characters", () => {
    const out = sanitizeFacts({
      data_retention: "x".repeat(5000),
      relevant_clauses: Array.from({ length: 50 }, (_, i) => `clause ${i}\u0007\n${"y".repeat(2000)}`),
    });
    expect(out.data_retention!.length).toBeLessThanOrEqual(300);
    expect(out.relevant_clauses).toHaveLength(10);
    for (const c of out.relevant_clauses) {
      expect(c.length).toBeLessThanOrEqual(500);
      expect(c).not.toMatch(/[\u0000-\u001f]/);
    }
  });

  it("returns all-null facts for a non-object response", () => {
    for (const bad of [null, "text", 42, [1, 2]]) {
      expect(sanitizeFacts(bad)).toEqual({
        trains_on_user_data: null,
        data_retention: null,
        gdpr_mentioned: null,
        opt_out_available: null,
        relevant_clauses: [],
      });
    }
  });
});

describe("extractFacts opt-out enforcement (mocked model)", () => {
  const reply = (obj: unknown) =>
    vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(obj) }] }), { status: 200 }));

  it("turns a marketing opt-out into opt_out_available=false", async () => {
    vi.stubGlobal("fetch", reply({ trains_on_user_data: true, opt_out_available: true, opt_out_clause: "You can opt out of marketing emails at any time.", relevant_clauses: [] }));
    const f = await extractFacts("We use your content to train our models.", "k");
    expect(f.opt_out_available).toBe(false);
    vi.unstubAllGlobals();
  });

  it("keeps a training opt-out", async () => {
    vi.stubGlobal("fetch", reply({ trains_on_user_data: true, opt_out_available: true, opt_out_clause: "You can turn off model training in Settings.", relevant_clauses: [] }));
    const f = await extractFacts("We use your content to train our models.", "k");
    expect(f.opt_out_available).toBe(true);
    vi.unstubAllGlobals();
  });
});
