// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("normalizes line endings and composes characters (NFC)", () => {
    expect(normalizeText("café\r\nnext\rline")).toBe("café\nnext\nline");
  });

  it("removes invisible and control characters", () => {
    expect(normalizeText("﻿su​do ap­t in⁠stall\u0007")).toBe("sudo apt install");
  });

  it("maps ligatures and unicode spaces", () => {
    expect(normalizeText("ﬁle ﬂow a b　c")).toBe("file flow a b c");
  });

  it("keeps superscripts and full-width characters (no NFKC)", () => {
    expect(normalizeText("x² ＡＢ")).toBe("x² ＡＢ");
  });

  it("collapses interior space runs and trims line ends, keeping indentation", () => {
    expect(normalizeText("a   b\t\tc   \n  - nested  item")).toBe("a b c\n  - nested item");
  });

  it("squeezes 3+ newlines and trims the document", () => {
    expect(normalizeText("\n\na\n\n\n\n b \n\n")).toBe("a\n\n b");
  });

  it("leaves the layout of code untouched", () => {
    const text = "x\n\n```\nif  (a)   {\n\tb();   \n}\n\n\n\n```\n\nrun `a   b`";
    expect(normalizeText(text)).toBe(text);
  });
});
