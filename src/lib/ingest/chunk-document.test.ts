// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chunkDocument } from "./chunk";

const long = (word: string) =>
  Array.from({ length: 12 }, (_, i) => `${word} sentence ${i} has enough words to count as content.`).join(" ");

describe("chunkDocument", () => {
  it("starts each chunk with the title and section path, skipping an H1 that repeats the title", () => {
    const text = `# Guide\n\n${long("Intro")}\n\n## Setup\n\n${long("Setup")}\n\n### Install\n\n${long("Install")}`;
    const { chunks, sectionsMerged } = chunkDocument(text, "Guide");
    expect(chunks.map((c) => c.split("\n\n")[0])).toEqual(["Guide", "Guide > Setup", "Guide > Setup > Install"]);
    expect(chunks[1]).toBe(`Guide > Setup\n\n${long("Setup")}`);
    expect(sectionsMerged).toBe(0);
  });

  it("uses just the title when there are no headings", () => {
    expect(chunkDocument("Plain notes.", "Notes")).toEqual({ chunks: ["Notes\n\nPlain notes."], sectionsMerged: 0 });
  });

  it("merges a small section into the next one, keeping its heading inline", () => {
    const text = `## Wi-Fi\n\n### iPhone\n\nOpen Settings.\n\n### Android\n\n${long("Android")}`;
    expect(chunkDocument(text, "Phones")).toEqual({
      chunks: [`Phones > Wi-Fi\n\n### iPhone\n\nOpen Settings.\n\n### Android\n\n${long("Android")}`],
      sectionsMerged: 1,
    });
  });

  it("merges a small last section back into the previous one", () => {
    const text = `## A\n\n${long("A")}\n\n## B\n\nTiny.`;
    expect(chunkDocument(text, "T")).toEqual({
      chunks: [`T\n\n## A\n\n${long("A")}\n\n## B\n\nTiny.`],
      sectionsMerged: 1,
    });
  });

  it("does not merge when the result would not fit in one chunk", () => {
    const text = `## A\n\nTiny.\n\n## B\n\n${long("B")}`;
    const { chunks, sectionsMerged } = chunkDocument(text, "T", { maxChars: 400, overlap: 50 });
    expect(sectionsMerged).toBe(0);
    expect(chunks[0]).toBe("T > A\n\nTiny.");
  });

  it("keeps every chunk within maxChars including the prefix, with overlap inside a section", () => {
    const text = `## Section\n\n${long("One")}\n\n${long("Two")}\n\n${long("Three")}`;
    const { chunks } = chunkDocument(text, "A fairly long document title", { maxChars: 300, overlap: 60 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
      expect(chunk.startsWith("A fairly long document title > Section\n\n")).toBe(true);
    }
    const body = (c: string) => c.slice(c.indexOf("\n\n") + 2);
    const firstEnd = body(chunks[0]).slice(-20);
    expect(body(chunks[1])).toContain(firstEnd.slice(firstEnd.indexOf(" ") + 1));
  });

  it("caps a very long prefix", () => {
    const { chunks } = chunkDocument(`## ${"Deep ".repeat(80)}\n\nBody text.`, "Title", { maxChars: 400, overlap: 20 });
    const prefix = chunks[0].split("\n\n")[0];
    expect(prefix.length).toBeLessThanOrEqual(100);
    expect(prefix.endsWith("…")).toBe(true);
  });

  it("returns no chunks for empty content", () => {
    expect(chunkDocument("", "T")).toEqual({ chunks: [], sectionsMerged: 0 });
  });
});
