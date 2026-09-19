import { describe, it, expect } from "vitest";
import { cleanText } from "./textUtil";

// Built from code points so the invisible characters are visible in this file.
const c = (n: number) => String.fromCodePoint(n);
const ZERO_WIDTH = c(0x200b);
const RLO = c(0x202e); // right-to-left override
const BOM = c(0xfeff);
const NEL = c(0x85); // C1 control

describe("cleanText", () => {
  it("returns null for non-strings and for text with nothing left after cleaning", () => {
    for (const bad of [undefined, null, 7, {}, [], "", "   ", ZERO_WIDTH + RLO + BOM]) {
      expect(cleanText(bad, 50)).toBeNull();
    }
  });

  it("replaces control, C1, zero-width, bidi and BOM characters and collapses whitespace", () => {
    expect(cleanText("a\u0000b" + NEL + "c" + ZERO_WIDTH + "d" + RLO + "e" + BOM + "f  \n g", 50)).toBe("a b c d e f g");
  });

  it("truncates by code point so a surrogate pair is never split", () => {
    const out = cleanText("😀😀😀😀😀", 3)!;
    expect(out).toBe("😀😀😀");
    expect(out.length).toBe(6); // 3 code points, 2 UTF-16 units each
  });

  it("marks truncation with an ellipsis when asked", () => {
    expect(cleanText("abcdefghij", 5, { ellipsis: true })).toBe("abcd…");
    expect(cleanText("abc", 5, { ellipsis: true })).toBe("abc");
  });
});
