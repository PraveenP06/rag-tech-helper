import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { getUsageOverview } from "./usage-store";

type UsageRowInput = {
  readonly id: string;
  readonly created_at: string;
  readonly latency_ms: number;
  readonly status: string;
  readonly grounded: boolean | null;
};

const makeClient = (rows: readonly UsageRowInput[], count: number): SupabaseClient => {
  const limit = vi.fn(async () => ({ data: rows, error: null }));
  const order = vi.fn(() => ({ limit }));
  const select = vi.fn((...args: unknown[]) => {
    const options = args[1] as { head?: boolean } | undefined;
    if (options?.head) {
      return Promise.resolve({ count, error: null });
    }
    return { order };
  });
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
};

describe("getUsageOverview", () => {
  it("returns exact totals, stats, and the 50 most recent rows", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `id-${i}`,
      created_at: `2026-11-04T00:${String(i % 60).padStart(2, "0")}:00.000Z`,
      latency_ms: 100 + i,
      status: i === 0 ? "error" : "ok",
      grounded: true,
    }));
    const overview = await getUsageOverview(makeClient(rows, 1234));

    expect(overview.totalQueries).toBe(1234);
    expect(overview.statsSampleSize).toBe(60);
    expect(overview.stats.totalQueries).toBe(60);
    expect(overview.stats.errorCount).toBe(1);
    expect(overview.recent).toHaveLength(50);
  });

  it("throws when the count query fails", async () => {
    const select = vi.fn(async () => ({ count: null, error: { message: "db down" } }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient;

    await expect(getUsageOverview(client)).rejects.toThrow(
      "Failed to count usage logs: db down",
    );
  });
});
