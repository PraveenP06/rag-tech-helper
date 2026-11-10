// @vitest-environment node
import type { Index } from "@pinecone-database/pinecone";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { clearKnowledgeBase, reloadKnowledgeBase } from "./knowledge-base";

type Row = { id: string; title: string; source_type: "upload" | "url"; source_ref: string; content: string | null };

/**
 * Just enough of supabase-js for these functions. Like the real database (which runs
 * pg-safeupdate), an UPDATE with no filter is rejected with "UPDATE requires a WHERE clause".
 */
function fakeSupabase(rows: Row[], options: { failUpdates?: boolean } = {}) {
  const events: string[] = [];
  const updates: Array<{ values: Record<string, unknown>; filters: string[] }> = [];

  const updateBuilder = (values: Record<string, unknown>) => {
    const filters: string[] = [];
    const builder = {
      eq: (column: string, value: unknown) => (filters.push(`${column}=eq.${value}`), builder),
      not: (column: string, op: string, value: unknown) => (filters.push(`${column}=not.${op}.${value}`), builder),
      then: (resolve: (result: { data: null; error: { message: string } | null }) => unknown) => {
        updates.push({ values, filters });
        events.push(filters.length ? `supabase update ${filters.join("&")}` : "supabase update (no filter)");
        const error = options.failUpdates
          ? { message: "connection reset" }
          : filters.length === 0
            ? { message: "UPDATE requires a WHERE clause" }
            : null;
        return Promise.resolve({ data: null, error }).then(resolve);
      },
    };
    return builder;
  };

  const client = {
    from: (table: string) => {
      expect(table).toBe("documents");
      return {
        select: () => ({
          order: () => ({
            range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
          }),
        }),
        update: updateBuilder,
      };
    },
  };
  return { client: client as unknown as SupabaseClient, events, updates };
}

function fakeIndex(events: string[]) {
  const upserted: string[] = [];
  const index = {
    documents: {
      delete: async (options: unknown) => void events.push(`pinecone delete ${JSON.stringify(options)}`),
      upsert: async ({ documents }: { documents: Array<{ _id: string }> }) => {
        upserted.push(...documents.map((d) => d._id));
        events.push(`pinecone upsert ${documents.length}`);
      },
    },
  };
  return { index: index as unknown as Index, upserted };
}

const rows: Row[] = [
  { id: "a", title: "Wi-Fi", source_type: "upload", source_ref: "wifi.md", content: "Open Settings and tap Wi-Fi." },
  { id: "b", title: "Docs", source_type: "url", source_ref: "https://example.com/docs", content: "Route handlers." },
];

describe("clearKnowledgeBase", () => {
  it("resets every stored document with a filter the database accepts, then clears the index", async () => {
    const supabase = fakeSupabase(rows);
    const { index } = fakeIndex(supabase.events);

    await clearKnowledgeBase(supabase.client, index);

    expect(supabase.updates).toEqual([
      { values: expect.objectContaining({ status: "pending", chunk_count: 0 }), filters: ["id=not.is.null"] },
    ]);
    expect(supabase.events).toEqual(["supabase update id=not.is.null", 'pinecone delete {"deleteAll":true}']);
  });

  it("leaves the index untouched when the database reset fails", async () => {
    const supabase = fakeSupabase(rows, { failUpdates: true });
    const { index } = fakeIndex(supabase.events);

    await expect(clearKnowledgeBase(supabase.client, index)).rejects.toThrow(/knowledge base reset failed/);
    expect(supabase.events.some((e) => e.startsWith("pinecone"))).toBe(false);
  });
});

describe("reloadKnowledgeBase", () => {
  it("resets, clears and re-indexes every stored document", async () => {
    const supabase = fakeSupabase(rows);
    const { index, upserted } = fakeIndex(supabase.events);

    const result = await reloadKnowledgeBase(supabase.client, index);

    expect(result).toEqual({ reloaded: 2, failed: 0, failures: [] });
    expect(supabase.events.slice(0, 2)).toEqual([
      "supabase update id=not.is.null",
      'pinecone delete {"deleteAll":true}',
    ]);
    expect(upserted).toEqual(["a#0", "b#0"]);
    expect(supabase.updates.slice(1).map((u) => [u.values.status, u.filters])).toEqual([
      ["ready", ["id=eq.a"]],
      ["ready", ["id=eq.b"]],
    ]);
  });

  it("leaves the index untouched when the database reset fails", async () => {
    const supabase = fakeSupabase(rows, { failUpdates: true });
    const { index } = fakeIndex(supabase.events);

    await expect(reloadKnowledgeBase(supabase.client, index)).rejects.toThrow(/knowledge base reset failed/);
    expect(supabase.events.some((e) => e.startsWith("pinecone"))).toBe(false);
  });
});
