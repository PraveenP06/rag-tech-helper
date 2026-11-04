import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

const sentence = (i: number) => `Sentence number ${i} explains one small idea about the topic.`;
const paragraph = (start: number, count: number) =>
  Array.from({ length: count }, (_, k) => sentence(start + k)).join(" ");

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n\t ")).toEqual([]);
  });

  it("returns a single trimmed chunk for a short document", () => {
    expect(chunkText("  Hello world.\r\n\r\nSecond para.  ")).toEqual([
      "Hello world.\n\nSecond para.",
    ]);
  });

  it("never produces a chunk longer than maxChars", () => {
    const doc = [paragraph(0, 30), paragraph(30, 5), "x".repeat(2500), paragraph(35, 40)].join(
      "\n\n",
    );
    const chunks = chunkText(doc, { maxChars: 500, overlap: 80 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500);
  });

  it("starts each chunk with text taken from the end of the previous one", () => {
    const doc = Array.from({ length: 8 }, (_, i) => paragraph(i * 10, 10)).join("\n\n");
    const chunks = chunkText(doc, { maxChars: 400, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const head = chunks[i].slice(0, 30);
      expect(chunks[i - 1]).toContain(head);
    }
  });

  it("does not lose content: every sentence appears in some chunk", () => {
    const doc = Array.from({ length: 6 }, (_, i) => paragraph(i * 10, 10)).join("\n\n");
    const chunks = chunkText(doc, { maxChars: 300, overlap: 50 });
    for (let i = 0; i < 60; i++) {
      expect(chunks.some((c) => c.includes(sentence(i)))).toBe(true);
    }
  });

  it("prefers paragraph boundaries when paragraphs fit", () => {
    const a = paragraph(0, 3);
    const b = paragraph(3, 3);
    const chunks = chunkText(`${a}\n\n${b}`, { maxChars: a.length + 10, overlap: 0 });
    expect(chunks).toEqual([a, b]);
  });

  it("rejects an overlap that is not smaller than maxChars", () => {
    expect(() => chunkText("abc", { maxChars: 100, overlap: 100 })).toThrow(/overlap/);
  });
});
