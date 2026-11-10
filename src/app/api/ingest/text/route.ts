import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { createIngestDeps } from "@/lib/ingest/deps";
import { IngestError } from "@/lib/ingest/errors";
import { assertContentLength, ingestResponse, isPreviewRequest } from "@/lib/ingest/http";
import { ingestDocument, previewDocument } from "@/lib/ingest/pipeline";
import { MAX_TEXT_BYTES, fromFile, fromText } from "@/lib/ingest/sources/text";
import type { RawDocument } from "@/lib/ingest/types";

// Leave headroom over the content limit for multipart framing and JSON escaping.
const MAX_BODY_BYTES = MAX_TEXT_BYTES * 2;

async function readRawDocument(request: Request): Promise<RawDocument> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new IngestError('Multipart requests need a "file" field', "validation");
    }
    const title = form.get("title");
    return fromFile(file, typeof title === "string" ? title : null);
  }

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => {
      throw new IngestError("Request body is not valid JSON", "validation");
    });
    return fromText(body);
  }

  throw new IngestError(
    "Send JSON {title, content} or multipart form data with a file",
    "validation",
  );
}

/**
 * Requires `Authorization: Bearer <INGEST_API_KEY>`.
 * Ingestion method 1: direct upload.
 *   JSON:      { "title": "...", "content": "..." }
 *   Multipart: file=<.md|.markdown|.txt>, optional title
 * Add `?preview=1` to see the cleaned text and chunks without storing anything.
 */
export async function POST(request: Request) {
  return ingestResponse(async () => {
    assertIngestAuthorized(request);
    assertContentLength(request, MAX_BODY_BYTES);
    const raw = await readRawDocument(request);
    return isPreviewRequest(request) ? previewDocument(raw) : ingestDocument(raw, createIngestDeps());
  });
}
