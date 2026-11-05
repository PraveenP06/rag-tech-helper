import { describe, expect, it } from "vitest";

import {
  computeUsageStats,
  mapUsageRow,
  type UsageLogEntry,
  type UsageStatus,
} from "./usage";

const makeEntry = (
  latencyMs: number,
  status: UsageStatus = "ok",
  grounded: boolean | null = true,
): UsageLogEntry => ({
  id: `entry-${latencyMs}-${status}`,
  createdAt: "2026-11-04T00:00:00.000Z",
  latencyMs,
  status,
  grounded,
});

describe("computeUsageStats", () => {
  it("returns zeros for no entries", () => {
    expect(computeUsageStats([])).toEqual({
      totalQueries: 0,
      errorCount: 0,
      errorRate: 0,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
    });
  });

  it("computes totals, error rate, and latency percentiles", () => {
    const stats = computeUsageStats([
      makeEntry(100),
      makeEntry(200),
      makeEntry(300, "error", null),
      makeEntry(400),
    ]);

    expect(stats.totalQueries).toBe(4);
    expect(stats.errorCount).toBe(1);
    expect(stats.errorRate).toBe(0.25);
    expect(stats.averageLatencyMs).toBe(250);
    expect(stats.p50LatencyMs).toBe(200);
    expect(stats.p95LatencyMs).toBe(400);
  });
});

describe("mapUsageRow", () => {
  it("maps snake_case rows and treats unknown statuses as ok", () => {
    expect(
      mapUsageRow({
        id: "abc",
        created_at: "2026-11-04T12:00:00.000Z",
        latency_ms: 123,
        status: "weird",
        grounded: false,
      }),
    ).toEqual({
      id: "abc",
      createdAt: "2026-11-04T12:00:00.000Z",
      latencyMs: 123,
      status: "ok",
      grounded: false,
    });
  });
});
