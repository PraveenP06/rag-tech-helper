import { beforeEach, describe, expect, it, vi } from "vitest";

const pineconeMocks = vi.hoisted(() => ({
  search: vi.fn(),
  index: vi.fn(),
  client: vi.fn(),
}));

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: pineconeMocks.client,
}));

import { retrieveFromPinecone } from "./pinecone-retriever";

describe("retrieveFromPinecone", () => {
  beforeEach(() => {
    process.env.PINECONE_API_KEY = "test-key";
    process.env.PINECONE_INDEX = "rag-tech-helper";
    pineconeMocks.search.mockReset();
    pineconeMocks.index.mockReset();
    pineconeMocks.client.mockReset();
    pineconeMocks.index.mockReturnValue({ documents: { search: pineconeMocks.search } });
    pineconeMocks.client.mockImplementation(function () {
      return { index: pineconeMocks.index };
    });
  });

  it("searches the schema-based index using integrated embedding", async () => {
    pineconeMocks.search.mockResolvedValue({
      matches: [
        {
          _id: "chunk-1",
          _score: 0.82,
          chunk_text: "Open Settings.",
          title: "Settings guide",
          source_url: "https://example.com/settings",
          document_id: "guide-1",
        },
      ],
    });

    await expect(retrieveFromPinecone("How do I open settings?")).resolves.toEqual([
      {
        id: "chunk-1",
        score: 0.82,
        text: "Open Settings.",
        documentId: "guide-1",
        title: "Settings guide",
        sourceUrl: "https://example.com/settings",
      },
    ]);
    expect(pineconeMocks.client).toHaveBeenCalledWith({ apiKey: "test-key" });
    expect(pineconeMocks.index).toHaveBeenCalledWith({ name: "rag-tech-helper" });
    expect(pineconeMocks.search).toHaveBeenCalledWith({
      scoreBy: [{ type: "embed", field: "chunk_text", query: "How do I open settings?" }],
      topK: 5,
      includeFields: ["chunk_text", "title", "source_url", "document_id"],
    });
  });

  it("fails clearly when Pinecone configuration is missing", async () => {
    delete process.env.PINECONE_API_KEY;

    await expect(retrieveFromPinecone("Help")).rejects.toThrow("PINECONE_API_KEY is required");
  });
});
