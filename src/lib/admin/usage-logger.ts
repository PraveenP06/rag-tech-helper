import type { SupabaseClient } from "@supabase/supabase-js";

import { getUsageSupabaseClient } from "./supabase";
import type { UsageStatus } from "./usage";

export type UsageLogInput = {
  readonly latencyMs: number;
  readonly status: UsageStatus;
  readonly grounded: boolean | null;
};

export type UsageLogger = (entry: UsageLogInput) => Promise<void>;

export const createUsageLogger = (client: SupabaseClient): UsageLogger =>
  async (entry) => {
    const { error } = await client.from("usage_logs").insert({
      latency_ms: entry.latencyMs,
      status: entry.status,
      grounded: entry.grounded,
    });
    if (error) {
      throw new Error(`Failed to record usage log: ${error.message}`);
    }
  };

/**
 * Production logger: writes to Supabase when configured, and never throws.
 * Usage logging is observability, not part of answering, so a missing config
 * or a failed insert degrades to a warning instead of failing the chat request.
 * Note: the question text is intentionally never logged, only counts, times,
 * and outcomes.
 */
export const logUsageToSupabase: UsageLogger = async (entry) => {
  try {
    const client = getUsageSupabaseClient();
    if (!client) {
      console.warn("Usage logging skipped: Supabase is not configured.");
      return;
    }
    await createUsageLogger(client)(entry);
  } catch (error) {
    console.warn("Usage logging failed.", error);
  }
};
