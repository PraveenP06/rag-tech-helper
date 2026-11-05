// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ingestDocument = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ingest/pipeline", () => ({ ingestDocument }));
vi.mock("@/lib/ingest/deps", () => ({ createIngestDeps: () => ({ fake: true }) }));

import { POST } from "./route";

const ready = { status: "ready", documentId: "d1", title: "T", chunkCount: 2 };

beforeEach(() => {
  vi.stubEnv("INGEST_API_KEY", "test-key");
  ingestDocument.mockReset().mockResolvedValue(ready);
});

afterEach(() => vi.unstubAllEnvs());

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/ingest/text", {
      method: "POST",
      body,
      headers: { authorization: "Bearer test-key", ...headers },
    }),
  );

describe("POST /api/ingest/text", () => {
  it("ingests pasted text sent as JSON", async () => {
    const res = await post(JSON.stringify({ title: "Note", content: "Hello" }), {
      "content-type": "application/json",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(ready);
    expect(ingestDocument).toHaveBeenCalledWith(
      { sourceType: "upload", sourceRef: "pasted-text", title: "Note", content: "Hello" },
      { fake: true },
    );
  });

  it("ingests an uploaded file sent as multipart form data", async () => {
    const form = new FormData();
    form.set("file", new File(["# Guide\n\nBody"], "guide.md"));
    const res = await post(form);
    expect(res.status).toBe(201);
    expect(ingestDocument.mock.calls[0][0]).toMatchObject({ sourceRef: "guide.md", title: "Guide" });
  });

  it("rejects a multipart request without a file", async () => {
    const form = new FormData();
    form.set("title", "No file");
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type before ingesting", async () => {
    const form = new FormData();
    form.set("file", new File(["x"], "image.png"));
    const res = await post(form);
    expect(res.status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and unsupported content types", async () => {
    expect((await post("{nope", { "content-type": "application/json" })).status).toBe(400);
    expect((await post("hi", { "content-type": "text/plain" })).status).toBe(400);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("rejects bodies whose declared length exceeds the limit", async () => {
    const res = await post(JSON.stringify({ title: "t", content: "c" }), {
      "content-type": "application/json",
      "content-length": String(10 * 1024 * 1024),
    });
    expect(res.status).toBe(413);
  });

  it("rejects requests without a valid key before reading the body", async () => {
    const body = JSON.stringify({ title: "Note", content: "Hello" });
    const json = { "content-type": "application/json" };
    expect((await post(body, { ...json, authorization: "" })).status).toBe(401);
    expect((await post(body, { ...json, authorization: "Bearer nope" })).status).toBe(401);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it("is disabled (503) when the server has no INGEST_API_KEY", async () => {
    vi.stubEnv("INGEST_API_KEY", "");
    const res = await post(JSON.stringify({ title: "Note", content: "Hello" }), {
      "content-type": "application/json",
    });
    expect(res.status).toBe(503);
    expect(ingestDocument).not.toHaveBeenCalled();
  });
});
