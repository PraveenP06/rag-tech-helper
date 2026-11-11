import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MIN_SCORE,
  EMERGENCY_MESSAGE,
  GREETING_MESSAGE,
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

  it.each(["hi", "Hi!", "hello", "Hey there", "good morning", "hi!!", "  Hello  "])(
    "greets the user and invites a question without searching or generating: %s",
    async (message) => {
      const deps = getDeps([getChunk()]);

      const result = await answerQuestion({ question: message, ...deps });

      expect(result).toEqual({ grounded: false, answer: GREETING_MESSAGE, sources: [] });
      expect(deps.retrieve).not.toHaveBeenCalled();
      expect(deps.generate).not.toHaveBeenCalled();
    },
  );

  it.each(["help", "What can you do?", "how can you help me"])(
    "explains what it can help with when asked for help: %s",
    async (message) => {
      const deps = getDeps([getChunk()]);

      const result = await answerQuestion({ question: message, ...deps });

      expect(result.answer).toBe(GREETING_MESSAGE);
      expect(deps.generate).not.toHaveBeenCalled();
    },
  );

  it("guides the user toward asking a question", () => {
    expect(GREETING_MESSAGE).toMatch(/how can i help/i);
    expect(GREETING_MESSAGE).toMatch(/video call|text bigger/i);
  });

  it("still answers a real question that starts with a greeting", async () => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({
      question: "Hi, how do I video call my grandson?",
      ...deps,
    });

    expect(result.grounded).toBe(true);
    expect(deps.retrieve).toHaveBeenCalledOnce();
  });

  it("chats naturally when no guide matches and the message is conversational", async () => {
    const deps = getDeps([]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(
      async () => "You are welcome! Ask me anything about your phone or computer.",
    );

    const result = await answerQuestion({ question: "thanks so much!", ...deps, converse });

    expect(result).toEqual({
      grounded: false,
      answer: "You are welcome! Ask me anything about your phone or computer.",
      sources: [],
    });
    expect(converse).toHaveBeenCalledWith("thanks so much!");
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("says it is not sure when no guide matches and the message is not conversational", async () => {
    const deps = getDeps([getChunk({ score: 0.1 })]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(async () => undefined);

    const result = await answerQuestion({
      question: "How do I jailbreak my phone?",
      ...deps,
      converse,
    });

    expect(result).toEqual({ grounded: false, answer: NOT_SURE_MESSAGE, sources: [] });
  });

  it("answers from the guides without chatting when a guide matches", async () => {
    const deps = getDeps([getChunk()]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(async () => "chat");

    const result = await answerQuestion({ question: "How do I call?", ...deps, converse });

    expect(result.grounded).toBe(true);
    expect(converse).not.toHaveBeenCalled();
  });

  it("does not chat about medical questions", async () => {
    const deps = getDeps([]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(async () => "chat");

    const result = await answerQuestion({
      question: "How much ibuprofen should I take?",
      ...deps,
      converse,
    });

    expect(result.answer).toBe(MEDICAL_REFUSAL_MESSAGE);
    expect(converse).not.toHaveBeenCalled();
  });

  it("says it is not sure if the conversation reply fails", async () => {
    const deps = getDeps([]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(async () => {
      throw new Error("model overloaded");
    });

    const result = await answerQuestion({ question: "thanks!", ...deps, converse });

    expect(result).toEqual({ grounded: false, answer: NOT_SURE_MESSAGE, sources: [] });
  });

  it.each([
    "I have diabetes, what should I eat?",
    "Is a blood sugar of 250 too high?",
    "Can I take aspirin with my blood thinner?",
    "My cholesterol medicine gives me side effects",
    "I think I have asthma",
    "What is a normal blood pressure for my age?",
    "Should I stop taking my insulin?",
    "I have arthritis, what helps with the pain?",
    "do I have dementia",
    "remind me to take my insulin, how much should I take?",
  ])("declines broader medical questions without retrieving or generating: %s", async (question) => {
    const deps = getDeps([getChunk()]);
    const converse = vi.fn<NonNullable<AnswerQuestionDependencies["converse"]>>(async () => "chat");

    const result = await answerQuestion({ question, ...deps, converse });

    expect(result).toEqual({ grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] });
    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
    expect(converse).not.toHaveBeenCalled();
  });

  it.each([
    "I got a text saying my package is delayed. What should I do?",
    "Someone called saying my computer has a virus. What should I do?",
    "My alarm didn't go off this morning, what should I do?",
    "Can I take a screenshot of a text message?",
    "Should I take the software update now?",
    "Is it safe to take my phone through airport security?",
  ])("treats everyday tech questions with advice phrasing as tech questions: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result.grounded).toBe(true);
    expect(deps.retrieve).toHaveBeenCalledWith(question);
    expect(deps.generate).toHaveBeenCalled();
  });

  it.each([
    "I feel dizzy, what should I do?",
    "Is it safe to take ibuprofen every day?",
    "How much should I take?",
  ])("still declines advice phrasing about health: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result).toEqual({ grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] });
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  describe("DEFAULT_MIN_SCORE", () => {
    // Calibrated on the live knowledge base: everyday phrasings of covered topics score about
    // 0.4-0.5, while off-topic questions stay under 0.2.
    it("answers an everyday phrasing whose best guide match scores in the 0.4s", async () => {
      const deps = { ...getDeps([getChunk({ score: 0.498 })]), minScore: DEFAULT_MIN_SCORE };

      const result = await answerQuestion({ question: "How do I video call my grandson on my iPhone?", ...deps });

      expect(result.grounded).toBe(true);
      expect(deps.generate).toHaveBeenCalled();
    });

    it("does not answer from a weak match", async () => {
      const deps = { ...getDeps([getChunk({ score: 0.3 })]), minScore: DEFAULT_MIN_SCORE };

      const result = await answerQuestion({ question: "How do I connect my printer?", ...deps });

      expect(result).toEqual({ grounded: false, answer: NOT_SURE_MESSAGE, sources: [] });
      expect(deps.generate).not.toHaveBeenCalled();
    });
  });

  it.each([
    "I have chest pain",
    "I think I am having a heart attack",
    "I can't breathe",
    "I took too many pills, an overdose",
    "I want to kill myself",
  ])("points to emergency help for urgent situations: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result).toEqual({ grounded: false, answer: EMERGENCY_MESSAGE, sources: [] });
    expect(deps.retrieve).not.toHaveBeenCalled();
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("tells people in an emergency to call 911 and offers the 988 crisis line", () => {
    expect(EMERGENCY_MESSAGE).toMatch(/911/);
    expect(EMERGENCY_MESSAGE).toMatch(/988/);
  });

  it.each([
    "How do I call 911 on my iPhone?",
    "How do I set a daily alarm to remind me to take my insulin?",
    "How do I make the text bigger on my phone?",
  ])("still helps with phone questions that touch on health or emergencies: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result.grounded).toBe(true);
    expect(deps.generate).toHaveBeenCalledOnce();
  });

  it.each([
    "I feel depressed and hopeless",
    "I think I am depressed",
    "I had a panic attack yesterday",
  ])("treats mental health conditions as medical questions: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result).toEqual({ grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] });
    expect(deps.retrieve).not.toHaveBeenCalled();
  });

  it.each(["I have no reason to live", "everyone would be better off without me"])(
    "points to emergency help when someone may be in crisis: %s",
    async (question) => {
      const deps = getDeps([getChunk()]);

      const result = await answerQuestion({ question, ...deps });

      expect(result).toEqual({ grounded: false, answer: EMERGENCY_MESSAGE, sources: [] });
    },
  );

  it.each([
    "I am hopeless with technology",
    "I feel anxious every time my phone beeps, how do I turn off notifications?",
    "I'm so frustrated with my tablet",
  ])("does not mistake everyday frustration with technology for a crisis: %s", async (question) => {
    const deps = getDeps([getChunk()]);

    const result = await answerQuestion({ question, ...deps });

    expect(result.grounded).toBe(true);
  });
});
