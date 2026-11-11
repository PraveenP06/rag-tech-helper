import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

import { MEDICAL_REFUSAL_MESSAGE, type GeneratedAnswer } from "./answer";

export type GeminiGenerator = (prompt: GeneratedAnswer) => Promise<string>;

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_MODEL = "gemini-3.6-flash";
const MODEL_FAILURE_MESSAGE = "Unable to generate an answer with Gemini.";
const NOT_CONVERSATION = "NOT_CONVERSATION";
const MEDICAL = "MEDICAL";
const conversationSystemPrompt =
  "You are Tech Helper, a friendly assistant that helps older adults with phones, tablets and computers. If the user's message is about health, a medical condition, symptoms, medication, or dosing, reply with exactly MEDICAL. If the user message is small talk, thanks, goodbye, a feeling, who are you, or what can you do, reply in at most two short, warm, plain-language sentences and invite them to ask a tech question. Never give technical instructions, device steps, or medical advice in this mode. If the message is a request for help with a device, app, account or any task, reply with exactly NOT_CONVERSATION.";

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

const generateTextWithGemini = async (system: string, prompt: string): Promise<string> => {
  const google = createGoogleGenerativeAI({ apiKey: requireApiKey() });

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

export const generateWithGemini: GeminiGenerator = async ({ system, context, question }) =>
  generateTextWithGemini(system, `Context:\n${context}\n\nQuestion:\n${question}`);

export const converseWithGemini = async (message: string): Promise<string | undefined> => {
  const text = (await generateTextWithGemini(conversationSystemPrompt, message)).trim();

  if (text.toLowerCase() === MEDICAL.toLowerCase()) {
    return MEDICAL_REFUSAL_MESSAGE;
  }

  return text && text.toLowerCase() !== NOT_CONVERSATION.toLowerCase() ? text : undefined;
};
