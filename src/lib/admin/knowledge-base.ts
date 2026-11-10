import type { SupabaseClient } from "@supabase/supabase-js";
import type { Index } from "@pinecone-database/pinecone";

import { chunkText } from "@/lib/ingest/chunk";
import type { ChunkDocument } from "@/lib/ingest/types";

const PAGE_SIZE = 500;
const UPSERT_BATCH_SIZE = 96;

interface StoredSource {
  id: string;
  title: string;
  source_type: "upload" | "url";
  source_ref: string;
  content: string | null;
}

function checked<T>({ data, error }: { data: T; error: { message: string } | null }, action: string): T {
  if (error) throw new Error(`Supabase ${action} failed: ${error.message}`);
  return data;
}

async function listSources(client: SupabaseClient): Promise<StoredSource[]> {
  const sources: StoredSource[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = checked(
      await client.from("documents")
        .select("id, title, source_type, source_ref, content")
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1),
      "knowledge base lookup",
    ) as StoredSource[];
    sources.push(...page);
    if (page.length < PAGE_SIZE) return sources;
  }
}

export async function clearKnowledgeBase(client: SupabaseClient, index: Index) {
  await index.documents.delete({ deleteAll: true });
  checked(
    await client.from("documents").update({
      status: "pending", chunk_count: 0, error: null, updated_at: new Date().toISOString(),
    }),
    "knowledge base reset",
  );
}

export async function reloadKnowledgeBase(client: SupabaseClient, index: Index) {
  const sources = await listSources(client);
  await index.documents.delete({ deleteAll: true });
  checked(
    await client.from("documents").update({
      status: "pending", chunk_count: 0, error: null, updated_at: new Date().toISOString(),
    }),
    "knowledge base reset",
  );
  let reloaded = 0;
  const failures: Array<{ title: string; error: string }> = [];

  for (const source of sources) {
    try {
      if (!source.content?.trim()) throw new Error("Stored source has no content to reload");
      const chunks = chunkText(source.content);
      const sourceUrl = source.source_type === "url" ? source.source_ref : `/documents/${source.id}`;
      const records: ChunkDocument[] = chunks.map((chunk_text, chunkIndex) => ({
        _id: `${source.id}#${chunkIndex}`,
        chunk_text,
        title: source.title,
        source_url: sourceUrl,
        document_id: source.id,
      }));
      for (let offset = 0; offset < records.length; offset += UPSERT_BATCH_SIZE) {
        await index.documents.upsert({ documents: records.slice(offset, offset + UPSERT_BATCH_SIZE) });
      }
      await client.from("documents").update({
        status: "ready", chunk_count: records.length, error: null, updated_at: new Date().toISOString(),
      }).eq("id", source.id).then((result) => checked(result, "document status update"));
      reloaded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reload error";
      failures.push({ title: source.title, error: message });
      await client.from("documents").update({
        status: "failed", error: message, updated_at: new Date().toISOString(),
      }).eq("id", source.id);
    }
  }

  return { reloaded, failed: failures.length, failures };
}
