// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("service clients", () => {
  it("can be imported without any env vars set", async () => {
    await expect(import("./clients")).resolves.toBeDefined();
  });

  it("throw a clear error only when a client is requested and env is missing", async () => {
    vi.stubEnv("PINECONE_API_KEY", "");
    const clients = await import("./clients");
    expect(() => clients.getPineconeIndex()).toThrow(/PINECONE_API_KEY/);
    expect(() => clients.getSupabase()).toThrow(/Missing or invalid environment variables/);
  });
});
