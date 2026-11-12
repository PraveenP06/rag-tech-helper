import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { createIngestDeps } from "@/lib/ingest/deps";
import { IngestError } from "@/lib/ingest/errors";
import { assertContentLength, ingestResponse, isPreviewRequest } from "@/lib/ingest/http";
import { ingestDocument, previewDocument, replaceDocument } from "@/lib/ingest/pipeline";
import { MAX_TEXT_BYTES, fromFile, fromText } from "@/lib/ingest/sources/text";
import type { RawDocument } from "@/lib/ingest/types";

// Leave headroom over the content limit for multipart framing and JSON escaping.
const MAX_BODY_BYTES = MAX_TEXT_BYTES * 2;

interface ParsedRequest {
  raw: RawDocument;
  documentId?: string;
}

function optionalDocumentId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new IngestError("documentId must be a valid document id", "validation");
  }
  return value;
}

async function readRawDocument(request: Request): Promise<ParsedRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new IngestError('Multipart requests need a "file" field', "validation");
    }
    const title = form.get("title");
    return {
      raw: await fromFile(file, typeof title === "string" ? title : null),
      documentId: optionalDocumentId(form.get("documentId")),
    };
  }

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => {
      throw new IngestError("Request body is not valid JSON", "validation");
    });
    return { raw: fromText(body), documentId: optionalDocumentId(
      typeof body === "object" && body !== null && "documentId" in body
        ? (body as { documentId?: unknown }).documentId
        : undefined,
    ) };
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
    const { raw, documentId } = await readRawDocument(request);
    if (isPreviewRequest(request)) return previewDocument(raw);
    return documentId
      ? replaceDocument(documentId, raw, createIngestDeps())
      : ingestDocument(raw, createIngestDeps());
  });
}
