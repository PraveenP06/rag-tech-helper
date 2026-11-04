// @vitest-environment node
import { describe, expect, it } from "vitest";
import { contentHash } from "./hash";

describe("contentHash", () => {
  it("is a 64-char hex sha256", () => {
    expect(contentHash("hello")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores whitespace-only differences", () => {
    expect(contentHash("Hello   world\r\n\nagain ")).toBe(contentHash(" Hello world\nagain"));
  });

  it("differs for different content", () => {
    expect(contentHash("Hello world")).not.toBe(contentHash("Hello there"));
  });
});
