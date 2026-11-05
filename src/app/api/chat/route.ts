import { z } from "zod";

import {
  logUsageToSupabase,
  type UsageLogInput,
  type UsageLogger,
} from "@/lib/admin/usage-logger";
import { answerQuestion, type GeneratedAnswer, type RetrievedChunk } from "@/lib/rag/answer";
import { generateWithGemini } from "@/lib/rag/gemini-generator";
import { retrieveFromPinecone } from "@/lib/rag/pinecone-retriever";

const questionSchema = z.object({ question: z.string().min(1).max(500) });

export type ChatRouteDependencies = {
  readonly retrieve: (question: string) => Promise<readonly RetrievedChunk[]>;
  readonly generate: (prompt: GeneratedAnswer) => Promise<string>;
  readonly minScore: number;
  readonly logUsage?: UsageLogger;
};

export type ChatPostHandler = (request: Request) => Promise<Response>;

const invalidRequest = (): Response => Response.json({ error: "Invalid question." }, { status: 400 });

export const createPostHandler = ({ retrieve, generate, minScore, logUsage }: ChatRouteDependencies): ChatPostHandler =>
  async (request) => {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return invalidRequest();
    }

    const parsedBody = questionSchema.safeParse(body);
    if (!parsedBody.success) {
      return invalidRequest();
    }

    // Usage logging is observability, never part of answering: it runs on
    // both the success and failure paths, and its own failures are swallowed
    // so logging can never break a chat request.
    const recordUsage = async (entry: UsageLogInput): Promise<void> => {
      if (!logUsage) {
        return;
      }
      try {
        await logUsage(entry);
      } catch {
        // Intentionally swallowed: logging must never fail a chat request.
      }
    };

    const startedAt = Date.now();
    try {
      const result = await answerQuestion({
        question: parsedBody.data.question,
        retrieve,
        generate,
        minScore,
      });
      await recordUsage({
        latencyMs: Date.now() - startedAt,
        status: "ok",
        grounded: result.grounded,
      });
      return Response.json(result);
    } catch (error: unknown) {
      await recordUsage({ latencyMs: Date.now() - startedAt, status: "error", grounded: null });
      console.error("Grounded answer request failed.", error);
      return Response.json({ error: "Unable to answer your question right now." }, { status: 500 });
    }
  };

export const POST = createPostHandler({
  retrieve: retrieveFromPinecone,
  generate: generateWithGemini,
  minScore: 0.5,
  logUsage: logUsageToSupabase,
});
