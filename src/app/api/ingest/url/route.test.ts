// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestError } from "@/lib/ingest/errors";

const ingestDocument = vi.hoisted(() => vi.fn());
const fromUrl = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ingest/pipeline", () => ({ ingestDocument }));
vi.mock("@/lib/ingest/sources/url", () => ({ fromUrl }));
vi.mock("@/lib/ingest/deps", () => ({ createIngestDeps: () => ({ fake: true }) }));

import { POST } from "./route";

const raw = { sourceType: "url", sourceRef: "https://x.dev/", title: "X", content: "Body" };

beforeEach(() => {
  fromUrl.mockReset().mockResolvedValue(raw);
  ingestDocument
    .mockReset()
    .mockResolvedValue({ status: "ready", documentId: "d", title: "X", chunkCount: 1 });
});

const post = (body: string, contentType = "application/json") =>
  POST(
    new Request("http://localhost/api/ingest/url", {
      method: "POST",
      body,
      headers: { "content-type": contentType },
    }),
  );

describe("POST /api/ingest/url", () => {
  it("scrapes the URL and ingests the page", async () => {
    const res = await post(JSON.stringify({ url: "https://x.dev" }));
    expect(res.status).toBe(201);
    expect(fromUrl).toHaveBeenCalledWith({ url: "https://x.dev" });
    expect(ingestDocument).toHaveBeenCalledWith(raw, { fake: true });
  });

  it("returns the scraper's error status", async () => {
    fromUrl.mockRejectedValueOnce(new IngestError("Fetching page failed: HTTP 404", "upstream"));
    const res = await post(JSON.stringify({ url: "https://x.dev/missing" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Fetching page failed: HTTP 404" });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("requires a JSON body", async () => {
    expect((await post("url=https://x.dev", "application/x-www-form-urlencoded")).status).toBe(400);
    expect((await post("{bad")).status).toBe(400);
    expect(fromUrl).not.toHaveBeenCalled();
  });
});
