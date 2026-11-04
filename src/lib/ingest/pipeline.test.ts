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
    embed: vi.fn(async (texts: string[]) => texts.map((_, i) => [i, 0.5, 1])),
    upsertVectors: vi.fn<IngestDeps["upsertVectors"]>().mockResolvedValue(),
    chunkOptions: { maxChars: 200, overlap: 20 },
  };
  return deps;
}

describe("ingestDocument", () => {
  it("chunks, embeds, upserts and marks the document ready", async () => {
    const deps = fakeDeps();
    const result = await ingestDocument(raw, deps);

    expect(deps.docs.createPending).toHaveBeenCalledWith({
      sourceType: "upload",
      sourceRef: "notes.md",
      title: "Notes",
      contentHash: contentHash(raw.content),
    });
    const chunks = deps.embed.mock.calls[0][0];
    expect(chunks.length).toBeGreaterThan(1);

    const records = deps.upsertVectors.mock.calls[0][0];
    expect(records).toHaveLength(chunks.length);
    expect(records[1]).toEqual({
      id: "doc-1#1",
      values: [1, 0.5, 1],
      metadata: {
        documentId: "doc-1",
        sourceType: "upload",
        sourceRef: "notes.md",
        title: "Notes",
        chunkIndex: 1,
        text: chunks[1],
      },
    });
    expect(deps.docs.markReady).toHaveBeenCalledWith("doc-1", chunks.length);
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
    expect(deps.embed).not.toHaveBeenCalled();
    expect(deps.upsertVectors).not.toHaveBeenCalled();
  });

  it("retries a previously failed document under the same id", async () => {
    const deps = fakeDeps({ id: "old", title: "Notes", status: "failed" });
    const result = await ingestDocument(raw, deps);
    expect(deps.docs.createPending).not.toHaveBeenCalled();
    expect(deps.docs.markPending).toHaveBeenCalledWith("old");
    expect(deps.upsertVectors.mock.calls[0][0][0].id).toBe("old#0");
    expect(result).toMatchObject({ status: "ready", documentId: "old" });
  });

  it("rejects empty content as a validation error without touching storage", async () => {
    const deps = fakeDeps();
    await expect(ingestDocument({ ...raw, content: " \n " }, deps)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(deps.docs.findByHash).not.toHaveBeenCalled();
  });

  it("marks the document failed and reports an upstream error when embedding fails", async () => {
    const deps = fakeDeps();
    deps.embed.mockRejectedValueOnce(new Error("quota exceeded"));
    const err = await ingestDocument(raw, deps).catch((e) => e);
    expect(err).toBeInstanceOf(IngestError);
    expect(err).toMatchObject({ kind: "upstream", message: expect.stringMatching(/quota exceeded/) });
    expect(deps.docs.markFailed).toHaveBeenCalledWith("doc-1", expect.stringMatching(/quota/));
    expect(deps.upsertVectors).not.toHaveBeenCalled();
    expect(deps.docs.markReady).not.toHaveBeenCalled();
  });

  it("fails when the embedder returns the wrong number of vectors", async () => {
    const deps = fakeDeps();
    deps.embed.mockResolvedValueOnce([[1, 2, 3]]);
    await expect(ingestDocument(raw, deps)).rejects.toMatchObject({ kind: "upstream" });
    expect(deps.docs.markFailed).toHaveBeenCalled();
  });

  it("marks the document failed when the vector upsert fails", async () => {
    const deps = fakeDeps();
    deps.upsertVectors.mockRejectedValueOnce(new Error("pinecone down"));
    await expect(ingestDocument(raw, deps)).rejects.toMatchObject({ kind: "upstream" });
    expect(deps.docs.markFailed).toHaveBeenCalledWith("doc-1", expect.stringMatching(/pinecone down/));
  });
});
