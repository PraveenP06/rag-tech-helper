// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getPineconeIndex, getSupabase, clearKnowledgeBase, reloadKnowledgeBase } = vi.hoisted(() => ({
  getPineconeIndex: vi.fn(() => ({ fake: "index" })),
  getSupabase: vi.fn(() => ({ fake: "supabase" })),
  clearKnowledgeBase: vi.fn(),
  reloadKnowledgeBase: vi.fn(),
}));
vi.mock("@/lib/clients", () => ({ getPineconeIndex, getSupabase }));
vi.mock("@/lib/admin/knowledge-base", () => ({ clearKnowledgeBase, reloadKnowledgeBase }));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("INGEST_API_KEY", "test-key");
  clearKnowledgeBase.mockReset().mockResolvedValue(undefined);
  reloadKnowledgeBase.mockReset().mockResolvedValue({ reloaded: 2, failed: 0, failures: [] });
});
afterEach(() => vi.unstubAllEnvs());

const post = (body: string, authorization = "Bearer test-key") => POST(new Request(
  "http://localhost/api/admin/knowledge-base",
  { method: "POST", headers: { authorization, "content-type": "application/json" }, body },
));

describe("POST /api/admin/knowledge-base", () => {
  it("rejects an invalid key", async () => {
    const response = await post('{"action":"clear"}', "Bearer wrong");
    expect(response.status).toBe(401);
    expect(clearKnowledgeBase).not.toHaveBeenCalled();
  });

  it("clears the index for an authorized administrator", async () => {
    const response = await post('{"action":"clear"}');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "cleared" });
    expect(clearKnowledgeBase).toHaveBeenCalledWith({ fake: "supabase" }, { fake: "index" });
  });

  it("reloads saved sources and reports partial failures", async () => {
    reloadKnowledgeBase.mockResolvedValue({ reloaded: 1, failed: 1, failures: [{ title: "Bad", error: "No text" }] });
    const response = await post('{"action":"reload"}');
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ reloaded: 1, failed: 1 });
  });

  it("rejects unknown actions", async () => {
    expect((await post('{"action":"drop-database"}')).status).toBe(400);
  });
});
