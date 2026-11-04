import type { Index } from "@pinecone-database/pinecone";
import type { VectorRecord } from "./types";

const UPSERT_BATCH_SIZE = 100;

/** Writes chunk vectors to Pinecone in batches. Record ids are `${documentId}#${chunkIndex}`. */
export function createVectorUpserter(index: Pick<Index, "upsert">) {
  return async function upsertVectors(records: VectorRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += UPSERT_BATCH_SIZE) {
      await index.upsert({ records: records.slice(i, i + UPSERT_BATCH_SIZE) });
    }
  };
}
