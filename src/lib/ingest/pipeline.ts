import { type ChunkOptions, chunkDocument } from "./chunk";
import { IngestError, errorMessage } from "./errors";
import { contentHash } from "./hash";
import { preprocessDocument } from "./preprocess";
import { MIN_DOCUMENT_CHARS, meaningfulLength } from "./preprocess/quality";
import type {
  ChunkDocument,
  CleaningReport,
  IngestDeps,
  IngestResult,
  PreviewResult,
  RawDocument,
} from "./types";

/** The app page that shows a stored document; cited by chat for uploads, which have no URL. */
export const documentPath = (documentId: string) => `/documents/${documentId}`;

async function upstream<T>(step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IngestError) throw err;
    throw new IngestError(`${step} failed: ${errorMessage(err)}`, "upstream", { cause: err });
  }
}

const EMPTY_DOCUMENT = "Document has no text content to ingest";

export interface PreparedDocument {
  /** The cleaned document: what gets hashed, stored and shown on its page. */
  document: RawDocument;
  chunks: string[];
  cleaning: CleaningReport;
  /** Why ingestion would refuse this document, if it would. */
  rejection?: string;
}

/** Cleans and chunks a document and applies the quality gate. Pure: no I/O. */
export function prepareDocument(raw: RawDocument, chunkOptions?: ChunkOptions): PreparedDocument {
  const { document, report } = preprocessDocument(raw);
  const { chunks, sectionsMerged } = chunkDocument(document.content, document.title, chunkOptions);
  const cleaning = { ...report, sectionsMerged };

  const readable = meaningfulLength(document.content);
  const rejection =
    chunks.length === 0
      ? EMPTY_DOCUMENT
      : readable < MIN_DOCUMENT_CHARS
        ? `Document has too little readable text after cleaning (${readable} characters; at least ${MIN_DOCUMENT_CHARS} needed)`
        : undefined;
  return rejection ? { document, chunks, cleaning, rejection } : { document, chunks, cleaning };
}

/** Shows what ingesting a document would store, without saving anything. */
export function previewDocument(raw: RawDocument, chunkOptions?: ChunkOptions): PreviewResult {
  const { document, chunks, cleaning, rejection } = prepareDocument(raw, chunkOptions);
  return {
    status: "preview",
    title: document.title,
    cleanedContent: document.content,
    chunks,
    cleaning,
    ...(rejection ? { wouldReject: { reason: rejection } } : {}),
  };
}

/**
 * The one pipeline every ingestion method feeds into: clean and chunk (see prepareDocument),
 * dedupe by content hash, then upsert to Pinecone (which embeds the text), and
 * record the document's status.
 */
export async function ingestDocument(raw: RawDocument, deps: IngestDeps): Promise<IngestResult> {
  const { document, chunks, cleaning, rejection } = prepareDocument(raw, deps.chunkOptions);
  if (rejection) throw new IngestError(rejection, "validation");

  const hash = contentHash(document.content);
  const existing = await deps.docs.findByHash(hash);
  if (existing && existing.status !== "failed") {
    return {
      status: "duplicate",
      documentId: existing.id,
      title: existing.title,
      existingStatus: existing.status,
      cleaning,
    };
  }

  let documentId: string;
  if (existing) {
    documentId = existing.id;
    await deps.docs.markPending(documentId);
  } else {
    ({ id: documentId } = await deps.docs.createPending({
      sourceType: document.sourceType,
      sourceRef: document.sourceRef,
      title: document.title,
      contentHash: hash,
      content: document.content,
    }));
  }

  try {
    const sourceUrl = document.sourceType === "url" ? document.sourceRef : documentPath(documentId);
    const records: ChunkDocument[] = chunks.map((text, chunkIndex) => ({
      _id: `${documentId}#${chunkIndex}`,
      chunk_text: text,
      title: document.title,
      source_url: sourceUrl,
      document_id: documentId,
    }));
    await upstream("Pinecone upsert", () => deps.upsertChunks(records));
    if (existing) {
      // A retry may produce fewer chunks than the failed attempt wrote; drop the extras.
      await upstream("Stale chunk cleanup", () =>
        deps.deleteStaleChunks(documentId, records.length),
      );
    }

    await deps.docs.markReady(documentId, chunks.length);
    return { status: "ready", documentId, title: document.title, chunkCount: chunks.length, cleaning };
  } catch (err) {
    // Best effort: don't let a status-update failure hide the original error.
    await deps.docs.markFailed(documentId, errorMessage(err)).catch(() => {});
    throw err;
  }
}

/** Replaces an existing source while preserving its document id and citation URL. */
export async function replaceDocument(
  documentId: string,
  raw: RawDocument,
  deps: IngestDeps,
): Promise<IngestResult> {
  const { document, chunks, cleaning, rejection } = prepareDocument(raw, deps.chunkOptions);
  if (rejection) throw new IngestError(rejection, "validation");

  const current = await deps.docs.findById(documentId);
  if (!current) throw new IngestError("Document to update was not found", "validation");

  const hash = contentHash(document.content);
  const duplicate = await deps.docs.findByHash(hash);
  if (duplicate && duplicate.id !== documentId) {
    return {
      status: "duplicate",
      documentId: duplicate.id,
      title: duplicate.title,
      existingStatus: duplicate.status,
      cleaning,
    };
  }

  await deps.docs.updatePending(documentId, {
    sourceType: document.sourceType,
    sourceRef: document.sourceRef,
    title: document.title,
    contentHash: hash,
    content: document.content,
  });

  try {
    const sourceUrl = document.sourceType === "url" ? document.sourceRef : documentPath(documentId);
    const records: ChunkDocument[] = chunks.map((text, chunkIndex) => ({
      _id: `${documentId}#${chunkIndex}`,
      chunk_text: text,
      title: document.title,
      source_url: sourceUrl,
      document_id: documentId,
    }));
    await upstream("Pinecone upsert", () => deps.upsertChunks(records));
    await upstream("Stale chunk cleanup", () => deps.deleteStaleChunks(documentId, records.length));
    await deps.docs.markReady(documentId, records.length);
    return { status: "ready", documentId, title: document.title, chunkCount: records.length, cleaning };
  } catch (err) {
    await deps.docs.markFailed(documentId, errorMessage(err)).catch(() => {});
    throw err;
  }
}
