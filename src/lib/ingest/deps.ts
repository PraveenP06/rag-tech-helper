import { getPineconeIndex, getSupabase } from "../clients";
import { createChunkUpserter } from "./chunk-store";
import { createDocumentRepo } from "./document-repo";
import type { IngestDeps } from "./types";

/** Wires the pipeline to the real Pinecone and Supabase clients. Call per request. */
export function createIngestDeps(): IngestDeps {
  return {
    docs: createDocumentRepo(getSupabase()),
    upsertChunks: createChunkUpserter(getPineconeIndex()),
  };
}
