// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IngestError } from "@/lib/ingest/errors";

const ingestDocument = vi.hoisted(() => vi.fn());
const replaceDocument = vi.hoisted(() => vi.fn());
const fromUrl = vi.hoisted(() => vi.fn());
const previewDocument = vi.hoisted(() => vi.fn());
const createIngestDeps = vi.hoisted(() => vi.fn(() => ({ fake: true })));
vi.mock("@/lib/ingest/pipeline", () => ({ ingestDocument, replaceDocument, previewDocument }));
vi.mock("@/lib/ingest/sources/url", () => ({ fromUrl }));
vi.mock("@/lib/ingest/deps", () => ({ createIngestDeps }));

import { POST } from "./route";

const raw = { sourceType: "url", sourceRef: "https://x.dev/", title: "X", content: "Body" };

const preview = { status: "preview", title: "T", cleanedContent: "Body", chunks: ["T\n\nBody"], cleaning: {} };

beforeEach(() => {
  vi.stubEnv("INGEST_API_KEY", "test-key");
  previewDocument.mockReset().mockReturnValue(preview);
  createIngestDeps.mockClear();
  fromUrl.mockReset().mockResolvedValue(raw);
  ingestDocument
    .mockReset()
    .mockResolvedValue({ status: "ready", documentId: "d", title: "X", chunkCount: 1 });
  replaceDocument.mockReset().mockResolvedValue({ status: "ready", documentId: "d", title: "X", chunkCount: 1 });
});

afterEach(() => vi.unstubAllEnvs());

const post = (body: string, contentType = "application/json", authorization = "Bearer test-key") =>
  POST(
    new Request("http://localhost/api/ingest/url", {
      method: "POST",
      body,
      headers: { "content-type": contentType, authorization },
    }),
  );

describe("POST /api/ingest/url", () => {
  it("scrapes the URL and ingests the page", async () => {
    const res = await post(JSON.stringify({ url: "https://x.dev" }));
    expect(res.status).toBe(201);
    expect(fromUrl).toHaveBeenCalledWith({ url: "https://x.dev" });
    expect(ingestDocument).toHaveBeenCalledWith(raw, { fake: true });
  });

  it("updates an existing document when documentId is supplied", async () => {
    const id = "868d1b2a-a7e1-4104-8a21-625be9cd1de9";
    const res = await post(JSON.stringify({ documentId: id, url: "https://x.dev" }));
    expect(res.status).toBe(201);
    expect(replaceDocument).toHaveBeenCalledWith(id, raw, { fake: true });
    expect(ingestDocument).not.toHaveBeenCalled();
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

  it("requires the ingest API key before fetching anything", async () => {
    const res = await post(JSON.stringify({ url: "https://x.dev" }), "application/json", "Bearer wrong");
    expect(res.status).toBe(401);
    expect(fromUrl).not.toHaveBeenCalled();
  });

  it("previews a scraped page with ?preview=1 without ingesting or touching storage", async () => {
    const res = await POST(
      new Request("http://localhost/api/ingest/url?preview=1", {
        method: "POST",
        body: JSON.stringify({ url: "https://x.dev" }),
        headers: { "content-type": "application/json", authorization: "Bearer test-key" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preview);
    expect(previewDocument).toHaveBeenCalledWith(raw);
    expect(ingestDocument).not.toHaveBeenCalled();
    expect(createIngestDeps).not.toHaveBeenCalled();
  });
});
