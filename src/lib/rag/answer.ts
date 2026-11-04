export const NOT_SURE_MESSAGE =
  "I’m not sure based on the guides I have. Please ask someone you trust for help.";

export const MEDICAL_REFUSAL_MESSAGE =
  "I can’t give medical or dosing advice. Please ask a doctor, pharmacist, or nurse.";

export type RetrievedChunk = {
  readonly id: string;
  readonly score: number;
  readonly text: string;
  readonly documentId: string;
  readonly title: string;
  readonly sourceUrl: string;
};

export type AnswerSource = {
  readonly documentId: string;
  readonly title: string;
  readonly sourceUrl: string;
};

export type GeneratedAnswer = {
  readonly system: string;
  readonly context: string;
  readonly question: string;
};

export type AnswerQuestionDependencies = {
  readonly question: string;
  readonly retrieve: (question: string) => Promise<readonly RetrievedChunk[]>;
  readonly generate: (prompt: GeneratedAnswer) => Promise<string>;
  readonly minScore: number;
};

export type AnswerQuestionResult = {
  readonly grounded: boolean;
  readonly answer: string;
  readonly sources: readonly AnswerSource[];
};

const systemPrompt =
  "Answer only from the provided context. Use simple plain language for older adults. Give short numbered steps. If the context does not answer the question, say you are not sure.";

const RELATIVE_SCORE_FLOOR = 0.8;

const isReminderQuestion = (question: string): boolean =>
  /\b(alarm|remind(?:er)?|calendar|notification)\b/i.test(question);

const isMedicalQuestion = (question: string): boolean =>
  /\b(ibuprofen|dose|dosage|medication|medicine|pills?|blood pressure|prescription|side effects?|symptoms?|diagnos(?:e|is)|treatment)\b/i.test(
    question,
  ) && !isReminderQuestion(question);

const toSources = (chunks: readonly RetrievedChunk[]): readonly AnswerSource[] => {
  const seenDocumentIds = new Set<string>();

  return chunks.flatMap((chunk) => {
    if (seenDocumentIds.has(chunk.documentId)) {
      return [];
    }

    seenDocumentIds.add(chunk.documentId);
    return [
      {
        documentId: chunk.documentId,
        title: chunk.title,
        sourceUrl: chunk.sourceUrl,
      },
    ];
  });
};

export const answerQuestion = async ({
  question,
  retrieve,
  generate,
  minScore,
}: AnswerQuestionDependencies): Promise<AnswerQuestionResult> => {
  if (isMedicalQuestion(question)) {
    return { grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] };
  }

  const chunks = await retrieve(question);
  const keptChunks = chunks.filter((chunk) => chunk.score >= minScore);

  if (keptChunks.length === 0) {
    return { grounded: false, answer: NOT_SURE_MESSAGE, sources: [] };
  }

  const bestKeptScore = Math.max(...keptChunks.map((chunk) => chunk.score));
  const relevantChunks = keptChunks.filter(
    (chunk) => chunk.score >= bestKeptScore * RELATIVE_SCORE_FLOOR,
  );

  const answer = await generate({
    system: systemPrompt,
    context: relevantChunks.map((chunk) => chunk.text).join("\n\n"),
    question,
  });

  return { grounded: true, answer, sources: toSources(relevantChunks) };
};
