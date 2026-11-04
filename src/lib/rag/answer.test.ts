import { describe, expect, it, vi } from "vitest";
import {
  NOT_SURE_MESSAGE,
  MEDICAL_REFUSAL_MESSAGE,
  answerQuestion,
  type AnswerQuestionDependencies,
  type RetrievedChunk,
} from "./answer";

const getChunk = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id: "chunk-1",
  score: 0.9,
  text: "Open the Phone app, tap Keypad, enter the number and press the green call button.",
  documentId: "doc-1",
  title: "How to make a phone call on iPhone",
  sourceUrl: "https://support.apple.com/guide/iphone/make-a-call",
  ...overrides,
});

const getDeps = (chunks: readonly RetrievedChunk[]) => ({
  retrieve: vi.fn<AnswerQuestionDependencies["retrieve"]>(async () => chunks),
  generate: vi.fn<AnswerQuestionDependencies["generate"]>(
    async () => "Open the Phone app and tap the green call button.",
  ),
  minScore: 0.5,
});

describe("answerQuestion", () => {
  it("answers from retrieved guides and returns the sources it used", async () => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({
      question: "How do I call my daughter?",
      ...deps,
    });

    expect(result).toEqual({
      grounded: true,
      answer: "Open the Phone app and tap the green call button.",
      sources: [
        {
          documentId: "doc-1",
          title: "How to make a phone call on iPhone",
          sourceUrl: "https://support.apple.com/guide/iphone/make-a-call",
        },
      ],
    });
  });

  it("only gives the model the retrieved guide text and tells it to stay within it", async () => {
    const deps = getDeps([getChunk({ text: "Tap the green button to call." })]);

    await answerQuestion({ question: "How do I call?", ...deps });

    const prompt = deps.generate.mock.calls[0]?.[0];
    expect(prompt?.context).toContain("Tap the green button to call.");
    expect(prompt?.system).toMatch(/only/i);
    expect(prompt?.question).toBe("How do I call?");
  });

  it("says it is not sure and skips the model when nothing relevant is found", async () => {
    const deps = getDeps([getChunk({ score: 0.2 })]);

    const result = await answerQuestion({
      question: "How do I jailbreak my phone?",
      ...deps,
    });

    expect(result).toEqual({ grounded: false, answer: NOT_SURE_MESSAGE, sources: [] });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("says it is not sure when retrieval returns nothing", async () => {
    const deps = getDeps([]);

    const result = await answerQuestion({ question: "Anything?", ...deps });

    expect(result.grounded).toBe(false);
    expect(result.answer).toBe(NOT_SURE_MESSAGE);
  });

  it("ignores weakly matching chunks when building the answer and sources", async () => {
    const deps = getDeps([
      getChunk({ id: "strong", documentId: "doc-1", score: 0.9 }),
      getChunk({
        id: "weak",
        documentId: "doc-2",
        score: 0.1,
        title: "Unrelated guide",
        text: "Unrelated text",
      }),
    ]);

    const result = await answerQuestion({ question: "How do I call?", ...deps });

    expect(result.sources.map((source) => source.documentId)).toEqual(["doc-1"]);
    expect(deps.generate.mock.calls[0]?.[0].context).not.toContain("Unrelated text");
  });

  it("lists each source document once even when several chunks come from it", async () => {
    const deps = getDeps([
      getChunk({ id: "a", documentId: "doc-1" }),
      getChunk({ id: "b", documentId: "doc-1" }),
    ]);

    const result = await answerQuestion({ question: "How do I call?", ...deps });

    expect(result.sources).toHaveLength(1);
  });

  it.each([
    "How much ibuprofen should I take?",
    "What dose of my blood pressure pills is safe?",
    "Can I stop taking my medication?",
  ])("declines medical advice without retrieving or generating: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result).toEqual({ grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] });
    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("still helps with setting a medication reminder on the phone", async () => {
    const deps = getDeps([getChunk({ title: "Set an alarm on iPhone" })]);

    const result = await answerQuestion({
      question: "How do I set a daily alarm to remind me to take my medication?",
      ...deps,
    });

    expect(result.grounded).toBe(true);
    expect(deps.generate).toHaveBeenCalledOnce();
  });

  it("leaves out guides that score far below the best match even if they pass the cutoff", async () => {
    const deps = getDeps([
      getChunk({ id: "best", documentId: "doc-1", score: 0.9, text: "Best guide text." }),
      getChunk({ id: "other", documentId: "doc-2", score: 0.55, text: "Loosely related text." }),
    ]);

    const result = await answerQuestion({ question: "How do I call?", ...deps });

    expect(result.sources.map((source) => source.documentId)).toEqual(["doc-1"]);
    expect(deps.generate.mock.calls[0]?.[0].context).not.toContain("Loosely related text.");
  });

  it("keeps every guide that matches about as well as the best one", async () => {
    const deps = getDeps([
      getChunk({ id: "a", documentId: "doc-1", score: 0.9 }),
      getChunk({ id: "b", documentId: "doc-2", score: 0.85 }),
    ]);

    const result = await answerQuestion({ question: "How do I call?", ...deps });

    expect(result.sources.map((source) => source.documentId)).toEqual(["doc-1", "doc-2"]);
  });
});
