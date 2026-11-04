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

export interface ChunkMetadata {
  documentId: string;
  sourceType: SourceType;
  sourceRef: string;
  title: string;
  chunkIndex: number;
  text: string;
  // Pinecone's RecordMetadata requires an index signature.
  [key: string]: string | number;
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: ChunkMetadata;
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
  embed(texts: string[]): Promise<number[][]>;
  upsertVectors(records: VectorRecord[]): Promise<void>;
  chunkOptions?: ChunkOptions;
}

export type IngestResult =
  | { status: "ready"; documentId: string; title: string; chunkCount: number }
  | { status: "duplicate"; documentId: string; title: string; existingStatus: DocumentStatus };
