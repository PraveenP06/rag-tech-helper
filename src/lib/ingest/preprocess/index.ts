import type { CleaningReport, RawDocument } from "../types";
import { removeBoilerplate } from "./boilerplate";
import { stripMarkdownNoise } from "./markdown";
import { normalizeText } from "./normalize";

const MAX_TITLE_CHARS = 200;

export interface PreprocessedDocument {
  document: RawDocument;
  /** Chunking adds `sectionsMerged`. */
  report: Omit<CleaningReport, "sectionsMerged">;
}

function cleanTitle(title: string): string {
  const cleaned = normalizeText(title).replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_CHARS);
  return cleaned || title;
}

/**
 * Cleans a document before it is chunked and indexed: characters and whitespace, markdown/HTML
 * noise, then site boilerplate and repeats. Pure and deterministic; code is never changed.
 */
export function preprocessDocument(raw: RawDocument): PreprocessedDocument {
  const markup = stripMarkdownNoise(normalizeText(raw.content));
  const { text, linesRemoved, duplicatesRemoved } = removeBoilerplate(markup);
  const content = normalizeText(text);

  return {
    document: { ...raw, title: cleanTitle(raw.title), content },
    report: {
      originalChars: raw.content.length,
      cleanedChars: content.length,
      boilerplateLinesRemoved: linesRemoved,
      duplicateBlocksRemoved: duplicatesRemoved,
    },
  };
}
