"use client";

import { useEffect, useState } from "react";
import { useAdminKey } from "./admin-key";
import type { UsageOverview } from "@/lib/admin/usage-store";

const easternDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function UsageDashboard() {
  const apiKey = useAdminKey();
  const [loaded, setLoaded] = useState<{
    key: string;
    overview?: UsageOverview;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    if (!apiKey) return () => { active = false; };

    fetch("/api/admin/usage", { headers: { authorization: `Bearer ${apiKey}` } })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? `Request failed (${response.status})`);
        return body as UsageOverview;
      })
      .then((data) => { if (active) setLoaded({ key: apiKey, overview: data }); })
      .catch((reason: unknown) => {
        if (active) {
          setLoaded({
            key: apiKey,
            error: reason instanceof Error ? reason.message : "Unable to load usage logs.",
          });
        }
      });

    return () => { active = false; };
  }, [apiKey]);

  const current = apiKey && loaded?.key === apiKey ? loaded : null;
  const overview = current?.overview ?? null;
  const error = current?.error ?? "";
  const loading = Boolean(apiKey) && current === null;

  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Usage logs</h1>
      {!apiKey ? <p>Enter the admin API key above to view usage logs.</p> : null}
      {loading ? <p role="status">Loading usage logs...</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {overview ? <>
        <section className="grid grid-cols-2 gap-4">
          <div><p className="text-sm text-zinc-600">Total queries</p><p className="text-3xl font-semibold">{overview.totalQueries}</p></div>
          <div><p className="text-sm text-zinc-600">Error rate</p><p className="text-3xl font-semibold">{(overview.stats.errorRate * 100).toFixed(1)}%</p></div>
          <div><p className="text-sm text-zinc-600">Failed requests</p><p className="text-3xl font-semibold">{overview.stats.errorCount}</p></div>
          <div><p className="text-sm text-zinc-600">Average latency</p><p className="text-3xl font-semibold">{Math.round(overview.stats.averageLatencyMs)} ms</p></div>
          <div><p className="text-sm text-zinc-600">p95 latency</p><p className="text-3xl font-semibold">{overview.stats.p95LatencyMs} ms</p></div>
        </section>
        <p className="text-sm text-zinc-600">Latency and failure stats cover the {overview.statsSampleSize} most recent queries.</p>
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Recent queries</h2>
          {overview.recent.length === 0 ? <p>No queries logged yet.</p> : (
            <table className="w-full border-collapse text-left text-sm">
              <thead><tr>
                <th className="border-b px-2 py-2">Time (Eastern)</th>
                <th className="border-b px-2 py-2">Latency</th>
                <th className="border-b px-2 py-2">Status</th>
                <th className="border-b px-2 py-2">Grounded</th>
              </tr></thead>
              <tbody>{overview.recent.map((entry) => <tr key={entry.id}>
                <td className="border-b px-2 py-2">{easternDateTime.format(new Date(entry.createdAt))}</td>
                <td className="border-b px-2 py-2">{entry.latencyMs} ms</td>
                <td className="border-b px-2 py-2">{entry.status}</td>
                <td className="border-b px-2 py-2">{entry.grounded === null ? "n/a" : entry.grounded ? "yes" : "no"}</td>
              </tr>)}</tbody>
            </table>
          )}
        </section>
      </> : null}
    </main>
  );
}
