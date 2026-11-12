import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentRepo, SourceType, StoredDocument, ViewableDocument } from "./types";

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

    async findById(id) {
      const data = check(
        await client
          .from(TABLE)
          .select("id, title, status")
          .eq("id", id)
          .maybeSingle(),
        "lookup",
      );
      return (data as StoredDocument | null) ?? null;
    },

    async createPending({ sourceType, sourceRef, title, contentHash, content }) {
      const data = check(
        await client
          .from(TABLE)
          .insert({
            source_type: sourceType,
            source_ref: sourceRef,
            title,
            content_hash: contentHash,
            content,
            status: "pending",
          })
          .select("id")
          .single(),
        "insert",
      );
      return { id: (data as { id: string }).id };
    },

    updatePending: (id, { sourceType, sourceRef, title, contentHash, content }) =>
      update(id, {
        source_type: sourceType,
        source_ref: sourceRef,
        title,
        content_hash: contentHash,
        content,
        status: "pending",
        chunk_count: 0,
        error: null,
      }, "update"),

    markPending: (id) => update(id, { status: "pending", chunk_count: 0, error: null }, "update"),
    markReady: (id, chunkCount) =>
      update(id, { status: "ready", chunk_count: chunkCount, error: null }, "update"),
    markFailed: (id, error) => update(id, { status: "failed", error }, "update"),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DocumentRow {
  id: string;
  title: string;
  source_type: SourceType;
  source_ref: string;
  content: string | null;
  created_at: string;
}

/** Loads a successfully ingested document for display. Returns null for unknown or malformed ids. */
export async function findDocumentById(
  client: SupabaseClient,
  id: string,
): Promise<ViewableDocument | null> {
  if (!UUID.test(id)) return null;
  const row = check(
    await client
      .from(TABLE)
      .select("id, title, source_type, source_ref, content, created_at")
      .eq("id", id)
      .eq("status", "ready")
      .maybeSingle(),
    "lookup",
  ) as DocumentRow | null;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    content: row.content ?? "",
    createdAt: row.created_at,
  };
}
