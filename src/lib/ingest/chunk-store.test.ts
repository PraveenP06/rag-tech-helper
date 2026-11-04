// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createChunkUpserter, createStaleChunkDeleter } from "./chunk-store";
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

describe("createStaleChunkDeleter", () => {
  function fakeIndex(pages: string[][]) {
    const list = vi.fn(async ({ paginationToken }: { prefix: string; paginationToken?: string }) => {
      const page = paginationToken ? Number(paginationToken) : 0;
      return {
        documents: pages[page].map((_id) => ({ _id })),
        pagination: page + 1 < pages.length ? { next: String(page + 1) } : undefined,
      };
    });
    const del = vi.fn().mockResolvedValue({ matchedRecords: 0 });
    return { index: { documents: { list, delete: del } }, list, del };
  }

  it("deletes chunks numbered at or beyond the new chunk count, across pages", async () => {
    const { index, list, del } = fakeIndex([
      ["doc#0", "doc#1", "doc#10"],
      ["doc#2", "doc#3", "doc#4"],
    ]);
    await createStaleChunkDeleter(index)("doc", 3);

    expect(list).toHaveBeenCalledWith(expect.objectContaining({ prefix: "doc#" }));
    expect(list).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del.mock.calls[0][0].ids.sort()).toEqual(["doc#10", "doc#3", "doc#4"]);
  });

  it("does not call delete when nothing is stale", async () => {
    const { index, del } = fakeIndex([["doc#0", "doc#1"]]);
    await createStaleChunkDeleter(index)("doc", 2);
    expect(del).not.toHaveBeenCalled();
  });

  it("only touches ids that belong to the document", async () => {
    // A prefix listing for "doc" could in theory return "doc#..." ids only, but be strict anyway.
    const { index, del } = fakeIndex([["doc#0", "doc#5", "doc-2#9", "doc#x"]]);
    await createStaleChunkDeleter(index)("doc", 1);
    expect(del.mock.calls[0][0].ids.sort()).toEqual(["doc#5", "doc#x"]);
  });
});
