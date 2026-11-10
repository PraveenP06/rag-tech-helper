import { Suspense } from "react";

import { getUsageOverview } from "@/lib/admin/usage-store";
import { getUsageSupabaseClient } from "@/lib/admin/supabase";
import { KnowledgeBaseControls } from "./knowledge-base-controls";

const easternDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export default function AdminUsagePage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <KnowledgeBaseControls />
      <Suspense
        fallback={
          <main className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">Usage logs</h1>
            <p>Loading usage logs...</p>
          </main>
        }
      >
        <UsageOverview />
      </Suspense>
    </div>
  );
}

async function UsageOverview() {
  const client = getUsageSupabaseClient();

  if (!client) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Usage logs</h1>
        <p>
          Usage logging is not configured yet. Set SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY, then apply the usage_logs migration.
        </p>
      </main>
    );
  }

  const overview = await getUsageOverview(client).catch(() => undefined);
  if (!overview) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-6 py-12">
        <h1 className="text-2xl font-semibold">Usage logs</h1>
        <p>Unable to load usage logs right now.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <h1 className="text-2xl font-semibold">Usage logs</h1>
      <section className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-zinc-600">Total queries</p>
          <p className="text-3xl font-semibold">{overview.totalQueries}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-600">Error rate</p>
          <p className="text-3xl font-semibold">
            {(overview.stats.errorRate * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-600">Failed requests</p>
          <p className="text-3xl font-semibold">{overview.stats.errorCount}</p>
        </div>
        <div>
          <p className="text-sm text-zinc-600">Average latency</p>
          <p className="text-3xl font-semibold">
            {Math.round(overview.stats.averageLatencyMs)} ms
          </p>
        </div>
        <div>
          <p className="text-sm text-zinc-600">p95 latency</p>
          <p className="text-3xl font-semibold">{overview.stats.p95LatencyMs} ms</p>
        </div>
      </section>
      <p className="text-sm text-zinc-600">
        Latency and failure stats cover the {overview.statsSampleSize} most recent queries.
      </p>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Recent queries</h2>
        {overview.recent.length === 0 ? (
          <p>No queries logged yet.</p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th className="border-b px-2 py-2">Time (Eastern)</th>
                <th className="border-b px-2 py-2">Latency</th>
                <th className="border-b px-2 py-2">Status</th>
                <th className="border-b px-2 py-2">Grounded</th>
              </tr>
            </thead>
            <tbody>
              {overview.recent.map((entry) => (
                <tr key={entry.id}>
                  <td className="border-b px-2 py-2">
                    {easternDateTime.format(new Date(entry.createdAt))}
                  </td>
                  <td className="border-b px-2 py-2">{entry.latencyMs} ms</td>
                  <td className="border-b px-2 py-2">{entry.status}</td>
                  <td className="border-b px-2 py-2">
                    {entry.grounded === null ? "n/a" : entry.grounded ? "yes" : "no"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
