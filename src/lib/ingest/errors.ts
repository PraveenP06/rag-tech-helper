/**
 * `validation`: the caller sent something we can't ingest (HTTP 400).
 * `unauthorized`: missing or wrong ingest API key (HTTP 401).
 * `too_large`: the request or document exceeds a size limit (HTTP 413).
 * `upstream`: a remote site or service (page fetch, Pinecone) failed (HTTP 502).
 * `unavailable`: ingestion is switched off because the server isn't configured (HTTP 503).
 */
export type IngestErrorKind = "validation" | "unauthorized" | "too_large" | "upstream" | "unavailable";

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
