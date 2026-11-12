import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { createIngestDeps } from "@/lib/ingest/deps";
import { IngestError } from "@/lib/ingest/errors";
import { assertContentLength, ingestResponse, isPreviewRequest } from "@/lib/ingest/http";
import { ingestDocument, previewDocument, replaceDocument } from "@/lib/ingest/pipeline";
import { fromUrl } from "@/lib/ingest/sources/url";

const MAX_BODY_BYTES = 10_000;

/**
 * Requires `Authorization: Bearer <INGEST_API_KEY>`.
 * Ingestion method 2: web page scraping.
 *   JSON: { "url": "https://..." }
 * Add `?preview=1` to see the cleaned text and chunks without storing anything.
 */
export async function POST(request: Request) {
  return ingestResponse(async () => {
    assertIngestAuthorized(request);
    assertContentLength(request, MAX_BODY_BYTES);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      throw new IngestError('Send JSON { "url": "https://..." }', "validation");
    }
    const body: unknown = await request.json().catch(() => {
      throw new IngestError("Request body is not valid JSON", "validation");
    });
    const raw = await fromUrl(body);
    const documentId = typeof body === "object" && body !== null && "documentId" in body
      ? (body as { documentId?: unknown }).documentId
      : undefined;
    if (documentId !== undefined &&
      (typeof documentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId))) {
      throw new IngestError("documentId must be a valid document id", "validation");
    }
    if (isPreviewRequest(request)) return previewDocument(raw);
    return documentId
      ? replaceDocument(documentId, raw, createIngestDeps())
      : ingestDocument(raw, createIngestDeps());
  });
}
