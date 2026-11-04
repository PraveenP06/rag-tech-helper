import { Pinecone } from "@pinecone-database/pinecone";

import type { RetrievedChunk } from "./answer";

export type PineconeRetriever = (question: string) => Promise<readonly RetrievedChunk[]>;

const TOP_K = 5;

const requireEnvironmentValue = (name: "PINECONE_API_KEY" | "PINECONE_INDEX"): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to retrieve grounded answers.`);
  }

  return value;
};

const stringField = (record: object, field: string): string => {
  const value = Reflect.get(record, field);
  return typeof value === "string" ? value : "";
};

const numberField = (record: object, field: string): number => {
  const value = Reflect.get(record, field);
  return typeof value === "number" ? value : 0;
};

export const retrieveFromPinecone: PineconeRetriever = async (question) => {
  const apiKey = requireEnvironmentValue("PINECONE_API_KEY");
  const indexName = requireEnvironmentValue("PINECONE_INDEX");
  const client = new Pinecone({ apiKey });
  const index = client.index({ name: indexName });
  const result = await index.documents.search({
    scoreBy: [{ type: "embed", field: "chunk_text", query: question }],
    topK: TOP_K,
    includeFields: ["chunk_text", "title", "source_url", "document_id"],
  });

  return result.matches.map((match) => ({
    id: match._id,
    score: numberField(match, "_score"),
    text: stringField(match, "chunk_text"),
    documentId: stringField(match, "document_id") || match._id,
    title: stringField(match, "title"),
    sourceUrl: stringField(match, "source_url"),
  }));
};
