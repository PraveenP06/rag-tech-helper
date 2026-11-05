import type { ChunkDocument } from "./types";

/** Pinecone caps document upserts at 96 per request when the index embeds a field. */
const UPSERT_BATCH_SIZE = 96;

interface DocumentWriter {
  documents: { upsert(options: { documents: ChunkDocument[] }): Promise<unknown> };
}

/** Writes chunk documents to the Pinecone index, which embeds `chunk_text` itself. */
export function createChunkUpserter(index: DocumentWriter) {
  return async function upsertChunks(chunks: ChunkDocument[]): Promise<void> {
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
      await index.documents.upsert({ documents: chunks.slice(i, i + UPSERT_BATCH_SIZE) });
    }
  };
}

const DELETE_BATCH_SIZE = 1000;

interface DocumentLister {
  documents: {
    list(options: { prefix: string; paginationToken?: string }): Promise<{
      documents: Array<{ _id: string }>;
      pagination?: { next: string };
    }>;
    delete(options: { ids: string[] }): Promise<unknown>;
  };
}

/**
 * Deletes a document's chunks numbered `keepCount` and above, i.e. leftovers from an earlier
 * attempt that produced more chunks. Chunk ids are `${documentId}#${chunkIndex}`.
 */
export function createStaleChunkDeleter(index: DocumentLister) {
  return async function deleteStaleChunks(documentId: string, keepCount: number): Promise<void> {
    const prefix = `${documentId}#`;
    const stale: string[] = [];
    let paginationToken: string | undefined;
    do {
      const page = await index.documents.list({ prefix, paginationToken });
      for (const { _id } of page.documents) {
        if (!_id.startsWith(prefix)) continue;
        const suffix = _id.slice(prefix.length);
        const chunkIndex = /^\d+$/.test(suffix) ? Number(suffix) : Number.NaN;
        if (!(chunkIndex < keepCount)) stale.push(_id);
      }
      paginationToken = page.pagination?.next;
    } while (paginationToken);

    for (let i = 0; i < stale.length; i += DELETE_BATCH_SIZE) {
      await index.documents.delete({ ids: stale.slice(i, i + DELETE_BATCH_SIZE) });
    }
  };
}
