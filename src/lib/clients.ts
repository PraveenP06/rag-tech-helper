import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Pinecone, type Index } from "@pinecone-database/pinecone";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

export const EMBEDDING_MODEL_ID = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

let pineconeIndex: Index | undefined;
let supabase: SupabaseClient | undefined;

export function getPineconeIndex(): Index {
  if (!pineconeIndex) {
    const env = getEnv();
    const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    pineconeIndex = pc.index({ name: env.PINECONE_INDEX, namespace: env.PINECONE_NAMESPACE });
  }
  return pineconeIndex;
}

export function getSupabase(): SupabaseClient {
  if (!supabase) {
    const env = getEnv();
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

export function getEmbeddingModel() {
  const env = getEnv();
  return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }).embedding(
    EMBEDDING_MODEL_ID,
  );
}
