// @vitest-environment node
import { describe, expect, it } from "vitest";
import { meaningfulLength } from "./quality";

describe("meaningfulLength", () => {
  it("counts letters and digits in any script, ignoring punctuation and whitespace", () => {
    expect(meaningfulLength("Wi-Fi 6, café! ## --- 日本")).toBe(11);
    expect(meaningfulLength("  ** -- **  ")).toBe(0);
  });
});
