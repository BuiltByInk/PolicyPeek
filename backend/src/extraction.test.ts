import { describe, it, expect, vi } from "vitest";
import { extractFacts } from "./extraction";

describe("extractFacts", () => {
  it("fails fast with an honest reason on empty text, without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(extractFacts("   \n\t  ", "fake-key")).rejects.toThrow(/empty_extracted_text/);
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
