import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentRepo, StoredDocument } from "./types";

const TABLE = "documents";

function check<T>({ data, error }: { data: T; error: { message: string } | null }, action: string): T {
  if (error) throw new Error(`Supabase ${action} failed: ${error.message}`);
  return data;
}

/** Tracks every ingested document (and its status) in the Supabase `documents` table. */
export function createDocumentRepo(client: SupabaseClient): DocumentRepo {
  const update = async (id: string, values: Record<string, unknown>, action: string) => {
    check(
      await client
        .from(TABLE)
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id),
      action,
    );
  };

  return {
    async findByHash(contentHash) {
      const data = check(
        await client
          .from(TABLE)
          .select("id, title, status")
          .eq("content_hash", contentHash)
          .maybeSingle(),
        "lookup",
      );
      return (data as StoredDocument | null) ?? null;
    },

    async createPending({ sourceType, sourceRef, title, contentHash }) {
      const data = check(
        await client
          .from(TABLE)
          .insert({
            source_type: sourceType,
            source_ref: sourceRef,
            title,
            content_hash: contentHash,
            status: "pending",
          })
          .select("id")
          .single(),
        "insert",
      );
      return { id: (data as { id: string }).id };
    },

    markPending: (id) => update(id, { status: "pending", chunk_count: 0, error: null }, "update"),
    markReady: (id, chunkCount) =>
      update(id, { status: "ready", chunk_count: chunkCount, error: null }, "update"),
    markFailed: (id, error) => update(id, { status: "failed", error }, "update"),
  };
}
