export type UsageStatus = "ok" | "error";

export type UsageLogEntry = {
  readonly id: string;
  readonly createdAt: string;
  readonly latencyMs: number;
  readonly status: UsageStatus;
  readonly grounded: boolean | null;
};

export type UsageStats = {
  readonly totalQueries: number;
  readonly errorCount: number;
  readonly errorRate: number;
  readonly averageLatencyMs: number;
  readonly p50LatencyMs: number;
  readonly p95LatencyMs: number;
};

/** One row of the Supabase usage_logs table, as the database returns it. */
export type UsageRow = {
  readonly id: string;
  readonly created_at: string;
  readonly latency_ms: number;
  readonly status: string;
  readonly grounded: boolean | null;
};

export const mapUsageRow = (row: UsageRow): UsageLogEntry => ({
  id: row.id,
  createdAt: row.created_at,
  latencyMs: row.latency_ms,
  status: row.status === "error" ? "error" : "ok",
  grounded: row.grounded,
});

const percentile = (sorted: readonly number[], fraction: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
};

export const computeUsageStats = (entries: readonly UsageLogEntry[]): UsageStats => {
  const latencies = entries.map((entry) => entry.latencyMs).sort((a, b) => a - b);
  const errorCount = entries.filter((entry) => entry.status === "error").length;
  const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
  return {
    totalQueries: entries.length,
    errorCount,
    errorRate: entries.length === 0 ? 0 : errorCount / entries.length,
    averageLatencyMs: entries.length === 0 ? 0 : totalLatency / entries.length,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
};
