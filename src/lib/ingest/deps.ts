import { getEmbeddingModel, getPineconeIndex, getSupabase } from "../clients";
import { createDocumentRepo } from "./document-repo";
import { createEmbedder } from "./embed";
import type { IngestDeps } from "./types";
import { createVectorUpserter } from "./vector-store";

/** Wires the pipeline to the real Gemini, Pinecone and Supabase clients. Call per request. */
export function createIngestDeps(): IngestDeps {
  return {
    docs: createDocumentRepo(getSupabase()),
    embed: createEmbedder(getEmbeddingModel()),
    upsertVectors: createVectorUpserter(getPineconeIndex()),
  };
}
