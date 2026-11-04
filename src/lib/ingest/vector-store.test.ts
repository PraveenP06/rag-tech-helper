// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { VectorRecord } from "./types";
import { createVectorUpserter } from "./vector-store";

const record = (i: number): VectorRecord => ({
  id: `doc#${i}`,
  values: [i],
  metadata: {
    documentId: "doc",
    sourceType: "url",
    sourceRef: "https://example.com",
    title: "Example",
    chunkIndex: i,
    text: `chunk ${i}`,
  },
});

describe("createVectorUpserter", () => {
  it("upserts records in batches of 100", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const records = Array.from({ length: 250 }, (_, i) => record(i));
    await createVectorUpserter({ upsert })(records);

    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls.map(([arg]) => arg.records.length)).toEqual([100, 100, 50]);
    expect(upsert.mock.calls[2][0].records[49]).toEqual(record(249));
  });

  it("does nothing for an empty list", async () => {
    const upsert = vi.fn();
    await createVectorUpserter({ upsert })([]);
    expect(upsert).not.toHaveBeenCalled();
  });
});
