// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { IngestError } from "./errors";
import { contentHash } from "./hash";
import { ingestDocument, previewDocument, replaceDocument } from "./pipeline";
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
    findById: vi.fn<DocumentRepo["findById"]>().mockResolvedValue(existing),
    createPending: vi.fn<DocumentRepo["createPending"]>().mockResolvedValue({ id: "doc-1" }),
    updatePending: vi.fn<DocumentRepo["updatePending"]>().mockResolvedValue(),
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
      cleaning: expect.any(Object),
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
      cleaning: expect.any(Object),
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

  it("stores and hashes the cleaned text, and starts each chunk with the title", async () => {
    const deps = fakeDeps();
    const messy = `Skip to main content\n\n${raw.content}\n\nBack to top`;
    const result = await ingestDocument({ ...raw, content: messy }, deps);

    expect(deps.docs.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ content: raw.content, contentHash: contentHash(raw.content) }),
    );
    for (const record of deps.upsertChunks.mock.calls[0][0]) {
      expect(record.chunk_text.startsWith("Notes\n\n")).toBe(true);
      expect(record.chunk_text.length).toBeLessThanOrEqual(200);
    }
    expect(result).toMatchObject({
      status: "ready",
      cleaning: {
        originalChars: messy.length,
        cleanedChars: raw.content.length,
        boilerplateLinesRemoved: 2,
        duplicateBlocksRemoved: 0,
        sectionsMerged: 0,
      },
    });
  });

  it("treats documents that differ only by boilerplate as duplicates", async () => {
    const deps = fakeDeps();
    await ingestDocument(raw, deps);
    await ingestDocument({ ...raw, content: `Copy\n\n${raw.content}\n\nWas this page helpful?` }, deps);
    const [first, second] = deps.docs.findByHash.mock.calls;
    expect(second).toEqual(first);
  });

  it("rejects documents with too little readable text after cleaning, without touching storage", async () => {
    const deps = fakeDeps();
    const err = await ingestDocument({ ...raw, content: "Copy\n\nBack to top\n\nShort note." }, deps).catch((e) => e);
    expect(err).toMatchObject({
      kind: "validation",
      message: "Document has too little readable text after cleaning (9 characters; at least 100 needed)",
    });
    expect(deps.docs.findByHash).not.toHaveBeenCalled();
    expect(deps.upsertChunks).not.toHaveBeenCalled();
  });
});

describe("previewDocument", () => {
  it("returns the cleaned text and chunks without saving anything", () => {
    const preview = previewDocument({ ...raw, content: `Copy\n\n${raw.content}` }, { maxChars: 200, overlap: 20 });
    expect(preview).toMatchObject({
      status: "preview",
      title: "Notes",
      cleanedContent: raw.content,
      cleaning: expect.objectContaining({ boilerplateLinesRemoved: 1 }),
    });
    expect(preview.chunks.length).toBeGreaterThan(1);
    expect(preview.chunks[0].startsWith("Notes\n\nFact 0")).toBe(true);
    expect(preview).not.toHaveProperty("wouldReject");
  });

  it("reports why a document would be rejected instead of throwing", () => {
    const preview = previewDocument({ ...raw, content: "Copy\n\nShort note." });
    expect(preview).toMatchObject({
      status: "preview",
      cleanedContent: "Short note.",
      wouldReject: { reason: expect.stringMatching(/too little readable text/) },
    });
  });

  it("reports empty documents with the existing message", () => {
    expect(previewDocument({ ...raw, content: "Copy" }).wouldReject).toEqual({
      reason: "Document has no text content to ingest",
    });
  });
});

describe("replaceDocument", () => {
  it("reindexes updated content under the existing document id", async () => {
    const deps = fakeDeps({ id: "old", title: "Old notes", status: "ready" });
    const updated = { ...raw, title: "Updated notes", content: raw.content.replaceAll("routing", "navigation") };

    const result = await replaceDocument("old", updated, deps);

    expect(deps.docs.updatePending).toHaveBeenCalledWith("old", expect.objectContaining({
      title: "Updated notes",
      content: updated.content,
      contentHash: contentHash(updated.content),
    }));
    expect(deps.upsertChunks.mock.calls[0][0][0]).toMatchObject({
      _id: "old#0",
      title: "Updated notes",
      document_id: "old",
      source_url: "/documents/old",
    });
    expect(deps.deleteStaleChunks).toHaveBeenCalledWith("old", expect.any(Number));
    expect(result).toMatchObject({ status: "ready", documentId: "old", title: "Updated notes" });
  });

  it("rejects an unknown document id", async () => {
    const deps = fakeDeps();
    await expect(replaceDocument("missing", raw, deps)).rejects.toMatchObject({
      kind: "validation",
      message: "Document to update was not found",
    });
    expect(deps.docs.updatePending).not.toHaveBeenCalled();
    expect(deps.upsertChunks).not.toHaveBeenCalled();
  });
});
