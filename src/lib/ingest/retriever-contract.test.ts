// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// Contract test: what ingestion writes must be readable by the chat retriever.
const search = vi.hoisted(() => vi.fn());
vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: vi.fn(function () {
    return { index: () => ({ documents: { search } }) };
  }),
}));

import { retrieveFromPinecone } from "@/lib/rag/pinecone-retriever";
import { ingestDocument } from "./pipeline";
import type { ChunkDocument, IngestDeps } from "./types";

afterEach(() => vi.unstubAllEnvs());

const CONTENT =
  "The app router uses folders to define routes. Each folder maps to a URL segment, and a page file inside it makes that segment publicly reachable.";

describe("ingestion ↔ retrieval contract", () => {
  it("chunks written by the pipeline come back intact through retrieveFromPinecone", async () => {
    let written: ChunkDocument[] = [];
    const deps: IngestDeps = {
      docs: {
        findByHash: async () => null,
        findById: async () => null,
        createPending: async () => ({ id: "doc-9" }),
        updatePending: async () => {},
        markPending: async () => {},
        markReady: async () => {},
        markFailed: async () => {},
      },
      upsertChunks: async (chunks) => {
        written = chunks;
      },
      deleteStaleChunks: async () => {},
    };
    await ingestDocument(
      {
        sourceType: "url",
        sourceRef: "https://nextjs.org/docs/routing",
        title: "Routing",
        content: CONTENT,
      },
      deps,
    );

    vi.stubEnv("PINECONE_API_KEY", "k");
    vi.stubEnv("PINECONE_INDEX", "i");
    search.mockResolvedValue({ matches: written.map((doc) => ({ ...doc, _score: 0.9 })) });

    await expect(retrieveFromPinecone("how do routes work?")).resolves.toEqual([
      {
        id: "doc-9#0",
        score: 0.9,
        // Ingestion prefixes each chunk with its title (and section path) for context.
        text: `Routing\n\n${CONTENT}`,
        documentId: "doc-9",
        title: "Routing",
        sourceUrl: "https://nextjs.org/docs/routing",
      },
    ]);
  });
});
