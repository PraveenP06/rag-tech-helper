// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { IngestError } from "./errors";
import { ingestResponse } from "./http";

describe("ingestResponse", () => {
  it("returns 201 for newly ingested documents and 200 for duplicates", async () => {
    const created = await ingestResponse(async () => ({
      status: "ready" as const,
      documentId: "d",
      title: "T",
      chunkCount: 3,
    }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ status: "ready", chunkCount: 3 });

    const dup = await ingestResponse(async () => ({
      status: "duplicate" as const,
      documentId: "d",
      title: "T",
      existingStatus: "ready" as const,
    }));
    expect(dup.status).toBe(200);
  });

  it("maps validation errors to 400 and upstream errors to 502", async () => {
    const bad = await ingestResponse(async () => {
      throw new IngestError("Title is required", "validation");
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "Title is required" });

    const up = await ingestResponse(async () => {
      throw new IngestError("Embedding failed: quota", "upstream");
    });
    expect(up.status).toBe(502);
  });

  it("hides unexpected error details behind a 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await ingestResponse(async () => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
    });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/SUPABASE/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("ingestResponse auth statuses", () => {
  it("maps unauthorized to 401 and unavailable to 503", async () => {
    const unauth = await ingestResponse(async () => {
      throw new IngestError("Missing or invalid ingest API key", "unauthorized");
    });
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("www-authenticate")).toBe("Bearer");

    const off = await ingestResponse(async () => {
      throw new IngestError("Ingestion is disabled", "unavailable");
    });
    expect(off.status).toBe(503);
  });
});
