// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { IngestError } from "./errors";
import { contentHash } from "./hash";
import { ingestDocument } from "./pipeline";
import type { DocumentRepo, IngestDeps, RawDocument, StoredDocument } from "./types";

const raw: RawDocument = {
  sourceType: "upload",
  sourceRef: "notes.md",
  title: "Notes",
  content: Array.from({ length: 40 }, (_, i) => `Fact ${i} about routing in Next.js.`).join("\n\n"),
};

function fakeDeps(existing: StoredDocument | null = null) {
  const docs = {
    findByHash: vi.fn<DocumentRepo["findByHash"]>().mockResolvedValue(existing),
    createPending: vi.fn<DocumentRepo["createPending"]>().mockResolvedValue({ id: "doc-1" }),
    markPending: vi.fn<DocumentRepo["markPending"]>().mockResolvedValue(),
    markReady: vi.fn<DocumentRepo["markReady"]>().mockResolvedValue(),
    markFailed: vi.fn<DocumentRepo["markFailed"]>().mockResolvedValue(),
  };
  const deps = {
    docs,
    upsertChunks: vi.fn<IngestDeps["upsertChunks"]>().mockResolvedValue(),
    deleteStaleChunks: vi.fn<IngestDeps["deleteStaleChunks"]>().mockResolvedValue(),
    chunkOptions: { maxChars: 200, overlap: 20 },
  };
  return deps;
}

describe("ingestDocument", () => {
  it("chunks, upserts and marks the document ready", async () => {
    const deps = fakeDeps();
    const result = await ingestDocument(raw, deps);

    expect(deps.docs.createPending).toHaveBeenCalledWith({
      sourceType: "upload",
      sourceRef: "notes.md",
      title: "Notes",
      contentHash: contentHash(raw.content),
      content: raw.content,
    });
    const records = deps.upsertChunks.mock.calls[0][0];
    expect(records.length).toBeGreaterThan(1);
    // Field names match what src/lib/rag/pinecone-retriever.ts reads back.
    expect(records[1]).toEqual({
      _id: "doc-1#1",
      chunk_text: expect.stringContaining("Fact"),
      title: "Notes",
      // Uploads have no web address, so they cite the app's own document page.
      source_url: "/documents/doc-1",
      document_id: "doc-1",
    });
    const chunks = records.map((r) => r.chunk_text);
    expect(deps.docs.markReady).toHaveBeenCalledWith("doc-1", chunks.length);
    expect(deps.deleteStaleChunks).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ready",
      documentId: "doc-1",
      title: "Notes",
      chunkCount: chunks.length,
    });
  });

  it("skips content that is already ingested", async () => {
    const deps = fakeDeps({ id: "old", title: "Old notes", status: "ready" });
    const result = await ingestDocument(raw, deps);
    expect(result).toEqual({
      status: "duplicate",
      documentId: "old",
      title: "Old notes",
      existingStatus: "ready",
    });
    expect(deps.docs.createPending).not.toHaveBeenCalled();
    expect(deps.upsertChunks).not.toHaveBeenCalled();
  });

  it("retries a previously failed document under the same id", async () => {
    const deps = fakeDeps({ id: "old", title: "Notes", status: "failed" });
    const result = await ingestDocument(raw, deps);
    expect(deps.docs.createPending).not.toHaveBeenCalled();
    expect(deps.docs.markPending).toHaveBeenCalledWith("old");
    expect(deps.upsertChunks.mock.calls[0][0][0]._id).toBe("old#0");
    expect(result).toMatchObject({ status: "ready", documentId: "old" });
  });

  it("removes leftover chunks from the failed attempt after re-upserting", async () => {
    const deps = fakeDeps({ id: "old", title: "Notes", status: "failed" });
    const order: string[] = [];
    deps.upsertChunks.mockImplementation(async () => void order.push("upsert"));
    deps.deleteStaleChunks.mockImplementation(async () => void order.push("cleanup"));

    await ingestDocument(raw, deps);
    const count = deps.upsertChunks.mock.calls[0][0].length;
    expect(deps.deleteStaleChunks).toHaveBeenCalledWith("old", count);
    expect(order).toEqual(["upsert", "cleanup"]);
  });

  it("marks a retry failed when stale-chunk cleanup fails, so it can be retried again", async () => {
    const deps = fakeDeps({ id: "old", title: "Notes", status: "failed" });
    deps.deleteStaleChunks.mockRejectedValueOnce(new Error("list timed out"));
    await expect(ingestDocument(raw, deps)).rejects.toMatchObject({ kind: "upstream" });
    expect(deps.docs.markFailed).toHaveBeenCalledWith("old", expect.stringMatching(/list timed out/));
    expect(deps.docs.markReady).not.toHaveBeenCalled();
  });

  it("rejects empty content as a validation error without touching storage", async () => {
    const deps = fakeDeps();
    await expect(ingestDocument({ ...raw, content: " \n " }, deps)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(deps.docs.findByHash).not.toHaveBeenCalled();
  });

  it("sets source_url to the page URL for scraped documents", async () => {
    const deps = fakeDeps();
    await ingestDocument(
      { ...raw, sourceType: "url", sourceRef: "https://nextjs.org/docs" },
      deps,
    );
    expect(deps.upsertChunks.mock.calls[0][0][0].source_url).toBe("https://nextjs.org/docs");
  });

  it("marks the document failed and reports an upstream error when the Pinecone upsert fails", async () => {
    const deps = fakeDeps();
    deps.upsertChunks.mockRejectedValueOnce(new Error("pinecone down"));
    const err = await ingestDocument(raw, deps).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err).toMatchObject({ kind: "upstream", message: expect.stringMatching(/pinecone down/) });
    expect(deps.docs.markFailed).toHaveBeenCalledWith("doc-1", expect.stringMatching(/pinecone down/));
    expect(deps.docs.markReady).not.toHaveBeenCalled();
  });
});
