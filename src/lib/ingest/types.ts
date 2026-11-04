import type { ChunkOptions } from "./chunk";

export type SourceType = "upload" | "url";

/** What every ingestion method produces before the shared pipeline takes over. */
export interface RawDocument {
  sourceType: SourceType;
  /** Filename for uploads, final URL for scraped pages. */
  sourceRef: string;
  title: string;
  content: string;
}

export type DocumentStatus = "pending" | "ready" | "failed";

export interface StoredDocument {
  id: string;
  title: string;
  status: DocumentStatus;
}

/**
 * One chunk as stored in the Pinecone index. The index embeds `chunk_text` itself
 * (integrated embedding), and these field names are what src/lib/rag/pinecone-retriever.ts
 * reads back, so keep the two in sync.
 */
export interface ChunkDocument {
  /** `${documentId}#${chunkIndex}` */
  _id: string;
  chunk_text: string;
  title: string;
  /** Page URL for scraped documents; empty for uploads. */
  source_url: string;
  document_id: string;
}

export interface DocumentRepo {
  findByHash(contentHash: string): Promise<StoredDocument | null>;
  createPending(input: {
    sourceType: SourceType;
    sourceRef: string;
    title: string;
    contentHash: string;
  }): Promise<{ id: string }>;
  /** Puts a previously failed document back into `pending` before a retry. */
  markPending(id: string): Promise<void>;
  markReady(id: string, chunkCount: number): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export interface IngestDeps {
  docs: DocumentRepo;
  upsertChunks(chunks: ChunkDocument[]): Promise<void>;
  /** Removes chunks `${documentId}#${n}` with n >= keepCount left over from an earlier attempt. */
  deleteStaleChunks(documentId: string, keepCount: number): Promise<void>;
  chunkOptions?: ChunkOptions;
}

export type IngestResult =
  | { status: "ready"; documentId: string; title: string; chunkCount: number }
  | { status: "duplicate"; documentId: string; title: string; existingStatus: DocumentStatus };
