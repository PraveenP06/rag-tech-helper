import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createUsageLogger } from "./usage-logger";

describe("createUsageLogger", () => {
  it("inserts one row per request", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ insert }));
    const client = { from } as unknown as SupabaseClient;

    const logUsage = createUsageLogger(client);
    await logUsage({ latencyMs: 123, status: "ok", grounded: true });

    expect(from).toHaveBeenCalledWith("usage_logs");
    expect(insert).toHaveBeenCalledWith({
      latency_ms: 123,
      status: "ok",
      grounded: true,
    });
  });

  it("throws when the insert fails", async () => {
    const insert = vi.fn(async () => ({ error: { message: "boom" } }));
    const from = vi.fn(() => ({ insert }));
    const client = { from } as unknown as SupabaseClient;

    const logUsage = createUsageLogger(client);
    await expect(
      logUsage({ latencyMs: 1, status: "error", grounded: null }),
    ).rejects.toThrow("Failed to record usage log: boom");
  });
});
