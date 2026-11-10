import { IngestError, type IngestErrorKind } from "./errors";
import type { IngestResult, PreviewResult } from "./types";

const STATUS_BY_KIND: Record<IngestErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  too_large: 413,
  upstream: 502,
  unavailable: 503,
};

/** Rejects early when the client declares a body larger than `maxBytes`. */
export function assertContentLength(request: Request, maxBytes: number): void {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IngestError(`Request body is too large (limit ${maxBytes} bytes)`, "too_large");
  }
}

/** `?preview=1` asks for a dry run: clean and chunk, but store nothing. */
export function isPreviewRequest(request: Request): boolean {
  return new URL(request.url).searchParams.get("preview") === "1";
}

/**
 * Runs an ingestion (or preview) and turns its outcome into a JSON response with the right
 * status code: 201 for newly ingested documents, 200 for duplicates and previews.
 */
export async function ingestResponse(
  run: () => Promise<IngestResult | PreviewResult>,
): Promise<Response> {
  try {
    const result = await run();
    return Response.json(result, { status: result.status === "ready" ? 201 : 200 });
  } catch (err) {
    if (err instanceof IngestError) {
      const headers: HeadersInit = err.kind === "unauthorized" ? { "www-authenticate": "Bearer" } : {};
      return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind], headers });
    }
    console.error("[ingest] unexpected error", err);
    return Response.json(
      { error: "Ingestion failed because of a server error. Check the server logs." },
      { status: 500 },
    );
  }
}
