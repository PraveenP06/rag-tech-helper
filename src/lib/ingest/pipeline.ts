import { chunkText } from "./chunk";
import { IngestError, errorMessage } from "./errors";
import { contentHash } from "./hash";
import type { ChunkDocument, IngestDeps, IngestResult, RawDocument } from "./types";

async function upstream<T>(step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError(`${step} failed: ${errorMessage(err)}`, "upstream", { cause: err });
  }
}

/**
 * The one pipeline every ingestion method feeds into:
 * dedupe by content hash, then chunk, upsert to Pinecone (which embeds the text), and
 * record the document's status.
 */
export async function ingestDocument(raw: RawDocument, deps: IngestDeps): Promise<IngestResult> {
  const chunks = chunkText(raw.content, deps.chunkOptions);
  if (chunks.length === 0) {
    throw new IngestError("Document has no text content to ingest", "validation");
  }

  const hash = contentHash(raw.content);
  const existing = await deps.docs.findByHash(hash);
  if (existing && existing.status !== "failed") {
    return {
      status: "duplicate",
      documentId: existing.id,
      title: existing.title,
      existingStatus: existing.status,
    };
  }

  let documentId: string;
  if (existing) {
    documentId = existing.id;
    await deps.docs.markPending(documentId);
  } else {
    ({ id: documentId } = await deps.docs.createPending({
      sourceType: raw.sourceType,
      sourceRef: raw.sourceRef,
      title: raw.title,
      contentHash: hash,
    }));
  }

  try {
    const sourceUrl = raw.sourceType === "url" ? raw.sourceRef : "";
    const records: ChunkDocument[] = chunks.map((text, chunkIndex) => ({
      _id: `${documentId}#${chunkIndex}`,
      chunk_text: text,
      title: raw.title,
      source_url: sourceUrl,
      document_id: documentId,
    }));
    await upstream("Pinecone upsert", () => deps.upsertChunks(records));

    await deps.docs.markReady(documentId, chunks.length);
    return { status: "ready", documentId, title: raw.title, chunkCount: chunks.length };
  } catch (err) {
    // Best effort: don't let a status-update failure hide the original error.
    await deps.docs.markFailed(documentId, errorMessage(err)).catch(() => {});
    throw err;
  }
}
