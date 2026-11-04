import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

import type { GeneratedAnswer } from "./answer";

export type GeminiGenerator = (prompt: GeneratedAnswer) => Promise<string>;

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-3.6-flash";
const MODEL_FAILURE_MESSAGE = "Unable to generate an answer with Gemini.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getStatusCode = (error: unknown): number | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }

  const response = isRecord(error.response) ? error.response : undefined;
  const values = [error.status, error.statusCode, response?.status];

  return values.find((value): value is number => typeof value === "number");
};

const isTransientNetworkError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : "";

  return /other side closed|socket|network|fetch failed|econnreset|econnrefused|etimedout|enotfound|eai_again|connection (?:reset|closed|refused)/i.test(
    message,
  );
};

const shouldTryNextModel = (error: unknown): boolean => {
  const statusCode = getStatusCode(error);

  return (
    statusCode === 404 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 503 ||
    isTransientNetworkError(error)
  );
};

const getModelNames = (configuredModel: string | undefined): readonly string[] => {
  const models = [configuredModel, DEFAULT_MODEL, FALLBACK_MODEL].filter(
    (model): model is string => Boolean(model),
  );

  return [...new Set(models)];
};

const requireApiKey = (): string => {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required to generate grounded answers.");
  }

  return apiKey;
};

export const generateWithGemini: GeminiGenerator = async ({ system, context, question }) => {
  const google = createGoogleGenerativeAI({ apiKey: requireApiKey() });
  const prompt = `Context:\n${context}\n\nQuestion:\n${question}`;

  for (const modelName of getModelNames(process.env.GEMINI_MODEL)) {
    try {
      const result = await generateText({
        model: google(modelName),
        system,
        prompt,
        maxRetries: 1,
      });

      return result.text;
    } catch (error) {
      if (!shouldTryNextModel(error)) {
        throw error;
      }
    }
  }

  throw new Error(MODEL_FAILURE_MESSAGE);
};
