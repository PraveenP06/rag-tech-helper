import { IngestError, type IngestErrorKind } from "./errors";
import type { IngestResult } from "./types";

const STATUS_BY_KIND: Record<IngestErrorKind, number> = {
  validation: 400,
  too_large: 413,
  upstream: 502,
};

/** Rejects early when the client declares a body larger than `maxBytes`. */
export function assertContentLength(request: Request, maxBytes: number): void {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IngestError(`Request body is too large (limit ${maxBytes} bytes)`, "too_large");
  }
}

/** Runs an ingestion and turns its outcome into a JSON response with the right status code. */
export async function ingestResponse(run: () => Promise<IngestResult>): Promise<Response> {
  try {
    const result = await run();
    return Response.json(result, { status: result.status === "ready" ? 201 : 200 });
  } catch (err) {
    if (err instanceof IngestError) {
      return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind] });
    }
    console.error("[ingest] unexpected error", err);
    return Response.json(
      { error: "Ingestion failed because of a server error. Check the server logs." },
      { status: 500 },
    );
  }
}
