import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeUsageStats,
  mapUsageRow,
  type UsageLogEntry,
  type UsageStats,
} from "./usage";

export const USAGE_STATS_SAMPLE_SIZE = 1000;
export const USAGE_RECENT_LIMIT = 50;

export type UsageOverview = {
  readonly totalQueries: number;
  readonly statsSampleSize: number;
  readonly stats: UsageStats;
  readonly recent: readonly UsageLogEntry[];
};

/**
 * Loads the usage overview: an exact total count plus latency/error stats
 * computed from the most recent USAGE_STATS_SAMPLE_SIZE rows, and the most
 * recent USAGE_RECENT_LIMIT rows for display. The stats window is capped so
 * the admin view stays fast as the log grows; the total count is exact.
 */
export const getUsageOverview = async (client: SupabaseClient): Promise<UsageOverview> => {
  const { count, error: countError } = await client
    .from("usage_logs")
    .select("*", { count: "exact", head: true });
  if (countError) {
    throw new Error(`Failed to count usage logs: ${countError.message}`);
  }

  const { data, error } = await client
    .from("usage_logs")
    .select("id, created_at, latency_ms, status, grounded")
    .order("created_at", { ascending: false })
    .limit(USAGE_STATS_SAMPLE_SIZE);
  if (error) {
    throw new Error(`Failed to load usage logs: ${error.message}`);
  }

  const entries = (data ?? []).map(mapUsageRow);
  return {
    totalQueries: count ?? entries.length,
    statsSampleSize: entries.length,
    stats: computeUsageStats(entries),
    recent: entries.slice(0, USAGE_RECENT_LIMIT),
  };
};
