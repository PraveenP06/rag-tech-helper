export const NOT_SURE_MESSAGE =
  "I’m not sure based on the guides I have. Please ask someone you trust for help.";

export const MEDICAL_REFUSAL_MESSAGE =
  "I can’t give medical or dosing advice. Please ask a doctor, pharmacist, or nurse.";

export const EMERGENCY_MESSAGE =
  "If this is an emergency or someone is in danger, call 911 right away. I can’t give medical advice. If you are thinking about hurting yourself, call or text 988.";

export const GREETING_MESSAGE =
  "Hi! How can I help you today? You can ask me things like “How do I video call my grandson?” or “How do I make the text on my phone bigger?”";

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
  readonly converse?: (message: string) => Promise<string | undefined>;
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

const GREETING_OR_HELP_PHRASES = new Set([
  "hi",
  "hello",
  "hey",
  "hey there",
  "hi there",
  "hello there",
  "good morning",
  "good afternoon",
  "good evening",
  "greetings",
  "yo",
  "howdy",
  "help",
  "help me",
  "what can you do",
  "how can you help",
  "how can you help me",
  "what do you do",
]);

const normalizeMessage = (message: string): string =>
  message.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim().replace(/\s+/g, " ");

const isGreetingOrHelpRequest = (message: string): boolean =>
  GREETING_OR_HELP_PHRASES.has(normalizeMessage(message));

const isReminderQuestion = (question: string): boolean =>
  /\b(alarm|remind(?:er)?|calendar|notification)\b/i.test(question);

const EMERGENCY_TERMS = [
  "chest pain",
  "heart attack",
  "overdose",
  "can(?:not|'t) breathe",
  "can not breathe",
  "trouble breathing",
  "suicid\\w*",
  "kill myself",
  "want to die",
  "hurt myself",
  "end my life",
  "no reason to live",
  "better off without me",
  "don(?:'t|’t) want to live",
  "nothing to live for",
] as const;

const MEDICAL_CONDITION_TERMS = [
  "diabet(?:es|ic)?",
  "hypertension",
  "blood pressure",
  "blood sugar",
  "glucose",
  "cholesterol",
  "asthma",
  "arthritis",
  "cancer",
  "stroke",
  "seizure",
  "epilepsy",
  "dementia",
  "alzheimer",
  "parkinson",
  "thyroid",
  "kidney disease",
  "liver disease",
  "copd",
  "depress\\w*",
  "panic attacks?",
  "bipolar",
  "schizophrenia",
  "ptsd",
  "anxiety",
  "infect\\w*",
  "fever",
  "rash",
  "dizz(?:y|iness)",
  "nausea",
  "pain",
  "symptom\\w*",
  "diagnos\\w*",
  "treat(?:ment|ing)?",
  "therap(?:y|ies)",
  "prescript(?:ion|ions)?",
] as const;

const MEDICAL_MEDICINE_TERMS = [
  "insulin",
  "aspirin",
  "ibuprofen",
  "tylenol",
  "acetaminophen",
  "advil",
  "blood thinner",
  "antibiotic\\w*",
  "opioid\\w*",
  "painkiller\\w*",
  "statin\\w*",
  "medicat(?:ion|ions|e|es|ed|ing)?",
  "medicine\\w*",
  "pills?",
  "dose",
  "dosage",
  "side effects?",
  "vitamins?",
  "supplements?",
] as const;

const medicalTerms = [...MEDICAL_CONDITION_TERMS, ...MEDICAL_MEDICINE_TERMS];
const emergencyPattern = new RegExp(`\\b(?:${EMERGENCY_TERMS.join("|")})\\b`, "i");
const medicalPattern = new RegExp(`\\b(?:${medicalTerms.join("|")})\\b`, "i");
const medicalAdvicePattern =
  /\b(?:should i take|can i take|stop taking|how much should i take|how much to take|is it safe to take|what should i)\b/i;
const reminderMedicalAdvicePattern =
  /\b(?:how much(?: should i)? take|should i take|can i take|stop taking|dose|dosage|safe to take|side effects?|what should i)\b/i;

const isEmergencyQuestion = (question: string): boolean => emergencyPattern.test(question);

const isMedicalQuestion = (question: string): boolean => {
  const hasMedicalContent = medicalPattern.test(question) || medicalAdvicePattern.test(question);

  return hasMedicalContent && (!isReminderQuestion(question) || reminderMedicalAdvicePattern.test(question));
};

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
  converse,
  minScore,
}: AnswerQuestionDependencies): Promise<AnswerQuestionResult> => {
  if (isGreetingOrHelpRequest(question)) {
    return { grounded: false, answer: GREETING_MESSAGE, sources: [] };
  }

  if (isEmergencyQuestion(question)) {
    return { grounded: false, answer: EMERGENCY_MESSAGE, sources: [] };
  }

  if (isMedicalQuestion(question)) {
    return { grounded: false, answer: MEDICAL_REFUSAL_MESSAGE, sources: [] };
  }

  const chunks = await retrieve(question);
  const keptChunks = chunks.filter((chunk) => chunk.score >= minScore);

  if (keptChunks.length === 0) {
    try {
      const conversationalAnswer = await converse?.(question);

      if (conversationalAnswer?.trim()) {
        return { grounded: false, answer: conversationalAnswer, sources: [] };
      }
    } catch {
      return { grounded: false, answer: NOT_SURE_MESSAGE, sources: [] };
    }

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
