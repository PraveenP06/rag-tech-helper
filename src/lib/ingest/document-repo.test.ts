// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createDocumentRepo, findDocumentById } from "./document-repo";

type Result = { data: unknown; error: { message: string; code?: string } | null };

/** Minimal chainable stand-in for the Supabase query builder that records each call. */
function fakeSupabase(result: Result) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "eq", "maybeSingle", "single"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (r: Result) => unknown) => resolve(result);
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe("createDocumentRepo", () => {
  it("findByHash returns the stored document", async () => {
    const { client, calls } = fakeSupabase({
      data: { id: "d1", title: "T", status: "ready" },
      error: null,
    });
    await expect(createDocumentRepo(client).findByHash("h")).resolves.toEqual({
      id: "d1",
      title: "T",
      status: "ready",
    });
    expect(calls).toEqual([
      ["from", "documents"],
      ["select", "id, title, status"],
      ["eq", "content_hash", "h"],
      ["maybeSingle"],
    ]);
  });

  it("findByHash returns null when nothing matches", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(createDocumentRepo(client).findByHash("h")).resolves.toBeNull();
  });

  it("createPending inserts a pending row with snake_case columns", async () => {
    const { client, calls } = fakeSupabase({ data: { id: "new" }, error: null });
    const repo = createDocumentRepo(client);
    await expect(
      repo.createPending({
        sourceType: "url",
        sourceRef: "https://x.dev",
        title: "X",
        contentHash: "h",
        content: "Body text",
      }),
    ).resolves.toEqual({ id: "new" });
    expect(calls).toContainEqual([
      "insert",
      {
        source_type: "url",
        source_ref: "https://x.dev",
        title: "X",
        content_hash: "h",
        content: "Body text",
        status: "pending",
      },
    ]);
  });

  it("markReady and markFailed update the row by id", async () => {
    const ready = fakeSupabase({ data: null, error: null });
    await createDocumentRepo(ready.client).markReady("d1", 7);
    expect(ready.calls).toContainEqual([
      "update",
      expect.objectContaining({ status: "ready", chunk_count: 7, error: null }),
    ]);
    expect(ready.calls).toContainEqual(["eq", "id", "d1"]);

    const failed = fakeSupabase({ data: null, error: null });
    await createDocumentRepo(failed.client).markFailed("d1", "boom");
    expect(failed.calls).toContainEqual([
      "update",
      expect.objectContaining({ status: "failed", error: "boom" }),
    ]);
  });

  it("markPending clears the previous error and chunk count", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await createDocumentRepo(client).markPending("d1");
    expect(calls).toContainEqual([
      "update",
      expect.objectContaining({ status: "pending", chunk_count: 0, error: null }),
    ]);
  });

  it("surfaces Supabase errors", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "relation does not exist" } });
    await expect(createDocumentRepo(client).findByHash("h")).rejects.toThrow(
      /relation does not exist/,
    );
  });
});

describe("findDocumentById", () => {
  const id = "868d1b2a-a7e1-4104-8a21-625be9cd1de9";

  it("returns a ready document with its content", async () => {
    const row = {
      id,
      title: "Alarm guide",
      source_type: "upload",
      source_ref: "alarm.md",
      content: "Open the Clock app.",
      status: "ready",
      created_at: "2026-11-05T10:00:00Z",
    };
    const { client, calls } = fakeSupabase({ data: row, error: null });
    await expect(findDocumentById(client, id)).resolves.toEqual({
      id,
      title: "Alarm guide",
      sourceType: "upload",
      sourceRef: "alarm.md",
      content: "Open the Clock app.",
      createdAt: "2026-11-05T10:00:00Z",
    });
    expect(calls).toContainEqual(["eq", "id", id]);
    expect(calls).toContainEqual(["eq", "status", "ready"]);
  });

  it("returns null when nothing matches", async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(findDocumentById(client, id)).resolves.toBeNull();
  });

  it("returns null for ids that are not UUIDs without querying", async () => {
    const { client, calls } = fakeSupabase({ data: null, error: null });
    await expect(findDocumentById(client, "not-a-uuid")).resolves.toBeNull();
    expect(calls).toEqual([]);
  });
});
