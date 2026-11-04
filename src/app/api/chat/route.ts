import { z } from "zod";

import { answerQuestion, type GeneratedAnswer, type RetrievedChunk } from "@/lib/rag/answer";
import { generateWithGemini } from "@/lib/rag/gemini-generator";
import { retrieveFromPinecone } from "@/lib/rag/pinecone-retriever";

const questionSchema = z.object({ question: z.string().min(1).max(500) });

export type ChatRouteDependencies = {
  readonly retrieve: (question: string) => Promise<readonly RetrievedChunk[]>;
  readonly generate: (prompt: GeneratedAnswer) => Promise<string>;
  readonly minScore: number;
};

export type ChatPostHandler = (request: Request) => Promise<Response>;

const invalidRequest = (): Response => Response.json({ error: "Invalid question." }, { status: 400 });

export const createPostHandler = ({ retrieve, generate, minScore }: ChatRouteDependencies): ChatPostHandler =>
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

    try {
      const result = await answerQuestion({
        question: parsedBody.data.question,
        retrieve,
        generate,
        minScore,
      });
      return Response.json(result);
    } catch (error: unknown) {
      console.error("Grounded answer request failed.", error);
      return Response.json({ error: "Unable to answer your question right now." }, { status: 500 });
    }
  };

export const POST = createPostHandler({
  retrieve: retrieveFromPinecone,
  generate: generateWithGemini,
  minScore: 0.5,
});
