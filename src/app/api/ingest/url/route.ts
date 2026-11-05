import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { createIngestDeps } from "@/lib/ingest/deps";
import { IngestError } from "@/lib/ingest/errors";
import { assertContentLength, ingestResponse } from "@/lib/ingest/http";
import { ingestDocument } from "@/lib/ingest/pipeline";
import { fromUrl } from "@/lib/ingest/sources/url";

const MAX_BODY_BYTES = 10_000;

/**
 * Requires `Authorization: Bearer <INGEST_API_KEY>`.
 * Ingestion method 2: web page scraping.
 *   JSON: { "url": "https://..." }
 */
export async function POST(request: Request) {
  return ingestResponse(async () => {
    assertIngestAuthorized(request);
    assertContentLength(request, MAX_BODY_BYTES);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      throw new IngestError('Send JSON { "url": "https://..." }', "validation");
    }
    const body = await request.json().catch(() => {
      throw new IngestError("Request body is not valid JSON", "validation");
    });
    const raw = await fromUrl(body);
    return ingestDocument(raw, createIngestDeps());
  });
}
