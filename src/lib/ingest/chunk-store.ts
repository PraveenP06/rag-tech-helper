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
