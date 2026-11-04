// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_TEXT_BYTES, fromFile, fromText } from "./text";

describe("fromText", () => {
  it("builds an upload document from pasted text", () => {
    expect(fromText({ title: "  My note ", content: "Some content" })).toEqual({
      sourceType: "upload",
      sourceRef: "pasted-text",
      title: "My note",
      content: "Some content",
    });
  });

  it("requires a title and non-blank content", () => {
    expect(() => fromText({ content: "x" })).toThrow("Title is required");
    expect(() => fromText({ title: "t" })).toThrow("Content is required");
    expect(() => fromText({ title: "", content: "x" })).toThrow(/title/i);
    expect(() => fromText({ title: "t", content: "   " })).toThrow(/content/i);
    expect(() => fromText(null)).toThrow();
  });

  it("rejects content over the size limit", () => {
    const big = "a".repeat(MAX_TEXT_BYTES + 1);
    expect(() => fromText({ title: "t", content: big })).toThrow(/too large/i);
  });

  it("throws validation errors", () => {
    try {
      fromText({ title: "", content: "" });
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ kind: "validation" });
    }
  });
});

describe("fromFile", () => {
  it("reads a markdown file and takes the title from its first heading", async () => {
    const file = new File(["# Routing Guide\n\nUse the app dir."], "routing.md", {
      type: "text/markdown",
    });
    await expect(fromFile(file)).resolves.toEqual({
      sourceType: "upload",
      sourceRef: "routing.md",
      title: "Routing Guide",
      content: "# Routing Guide\n\nUse the app dir.",
    });
  });

  it("falls back to the filename, and an explicit title wins", async () => {
    const file = new File(["plain notes"], "my-notes.txt", { type: "text/plain" });
    await expect(fromFile(file)).resolves.toMatchObject({ title: "my-notes" });
    await expect(fromFile(file, "Custom")).resolves.toMatchObject({ title: "Custom" });
  });

  it("rejects unsupported extensions", async () => {
    const file = new File(["%PDF-1.7"], "spec.pdf", { type: "application/pdf" });
    await expect(fromFile(file)).rejects.toMatchObject({
      kind: "validation",
      message: expect.stringMatching(/\.md.*\.txt/),
    });
  });

  it("rejects files over the size limit and binary content", async () => {
    const big = new File(["a".repeat(MAX_TEXT_BYTES + 1)], "big.txt");
    await expect(fromFile(big)).rejects.toThrow(/too large/i);
    const binary = new File([new Uint8Array([72, 0, 105])], "bin.txt");
    await expect(fromFile(binary)).rejects.toThrow(/binary/i);
  });

  it("rejects an empty file", async () => {
    await expect(fromFile(new File([""], "empty.md"))).rejects.toThrow(/empty/i);
  });
});
