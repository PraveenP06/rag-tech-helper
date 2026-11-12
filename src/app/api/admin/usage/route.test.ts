// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUsageOverview, getUsageSupabaseClient } = vi.hoisted(() => ({
  getUsageOverview: vi.fn(),
  getUsageSupabaseClient: vi.fn(() => ({ fake: "supabase" })),
}));
vi.mock("@/lib/admin/usage-store", () => ({ getUsageOverview }));
vi.mock("@/lib/admin/supabase", () => ({ getUsageSupabaseClient }));

import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("INGEST_API_KEY", "test-key");
  getUsageOverview.mockReset().mockResolvedValue({ totalQueries: 0, recent: [] });
  getUsageSupabaseClient.mockReset().mockReturnValue({ fake: "supabase" });
});
afterEach(() => vi.unstubAllEnvs());

const get = (authorization?: string) => GET(new Request("http://localhost/api/admin/usage", {
  headers: authorization ? { authorization } : {},
}));

describe("GET /api/admin/usage", () => {
  it("rejects requests without a valid admin key", async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect(getUsageOverview).not.toHaveBeenCalled();
  });

  it("returns usage data for an authorized administrator", async () => {
    const response = await get("Bearer test-key");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ totalQueries: 0, recent: [] });
    expect(getUsageOverview).toHaveBeenCalledWith({ fake: "supabase" });
  });

  it("refuses access when the server key is not configured", async () => {
    vi.stubEnv("INGEST_API_KEY", "");
    const response = await get("Bearer test-key");
    expect(response.status).toBe(503);
    expect(getUsageOverview).not.toHaveBeenCalled();
  });
});
