import { createHash, timingSafeEqual } from "node:crypto";
import { IngestError } from "./errors";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Ingestion writes to the shared knowledge base and spends Pinecone credits, so both
 * ingest routes require `Authorization: Bearer <INGEST_API_KEY>`. With no key configured
 * the routes refuse everything rather than falling back to open access.
 */
export function assertIngestAuthorized(
  request: Request,
  configuredKey: string | undefined = process.env.INGEST_API_KEY,
): void {
  const expected = configuredKey?.trim();
  if (!expected) {
    throw new IngestError(
      "Ingestion is disabled: INGEST_API_KEY is not set on the server",
      "unavailable",
    );
  }
  const provided = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  // Compare fixed-length digests so the check takes the same time whatever the input.
  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new IngestError("Missing or invalid ingest API key", "unauthorized");
  }
}
