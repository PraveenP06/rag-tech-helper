import { Pinecone, type Index } from "@pinecone-database/pinecone";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let pineconeIndex: Index | undefined;
let supabase: SupabaseClient | undefined;

export function getPineconeIndex(): Index {
  if (!pineconeIndex) {
    const env = getEnv();
    const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    // Default namespace, same as the chat retriever in src/lib/rag/pinecone-retriever.ts.
    pineconeIndex = pc.index({ name: env.PINECONE_INDEX });
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
