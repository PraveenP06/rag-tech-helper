/**
 * `validation`: the caller sent something we can't ingest (HTTP 400).
 * `too_large`: the request or document exceeds a size limit (HTTP 413).
 * `upstream`: a remote site or service (page fetch, Gemini, Pinecone) failed (HTTP 502).
 */
export type IngestErrorKind = "validation" | "too_large" | "upstream";

export class IngestError extends Error {
  constructor(
    message: string,
    readonly kind: IngestErrorKind,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "IngestError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
