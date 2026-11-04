import { embedMany, type EmbeddingModel } from "ai";
import { EMBEDDING_DIMENSIONS } from "../clients";

/**
 * Embeds document chunks with Gemini. `embedMany` splits the input into
 * requests of at most 100 values on its own, so no manual batching here.
 */
export function createEmbedder(model: EmbeddingModel) {
  return async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await embedMany({
      model,
      values: texts,
      maxParallelCalls: 2,
      providerOptions: {
        google: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT" },
      },
    });
    return embeddings;
  };
}
