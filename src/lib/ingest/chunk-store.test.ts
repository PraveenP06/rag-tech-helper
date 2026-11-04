// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createChunkUpserter } from "./chunk-store";
import type { ChunkDocument } from "./types";

const chunk = (i: number): ChunkDocument => ({
  _id: `doc#${i}`,
  chunk_text: `chunk ${i}`,
  title: "Example",
  source_url: "https://example.com",
  document_id: "doc",
});

describe("createChunkUpserter", () => {
  it("writes chunk documents in batches of 96 (Pinecone's limit for integrated embedding)", async () => {
    const upsert = vi.fn().mockResolvedValue({ upsertedCount: 0 });
    const chunks = Array.from({ length: 200 }, (_, i) => chunk(i));
    await createChunkUpserter({ documents: { upsert } })(chunks);

    expect(upsert.mock.calls.map(([arg]) => arg.documents.length)).toEqual([96, 96, 8]);
    expect(upsert.mock.calls[2][0].documents[7]).toEqual(chunk(199));
  });

  it("does nothing for an empty list", async () => {
    const upsert = vi.fn();
    await createChunkUpserter({ documents: { upsert } })([]);
    expect(upsert).not.toHaveBeenCalled();
  });
});
