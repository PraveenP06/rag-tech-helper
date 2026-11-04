export interface ChunkOptions {
  /** Hard upper bound on chunk length, in characters. */
  maxChars?: number;
  /** Approximate number of trailing characters repeated at the start of the next chunk. */
  overlap?: number;
}

export const DEFAULT_CHUNK_OPTIONS = { maxChars: 1000, overlap: 150 } as const;

interface Unit {
  text: string;
  /** Joiner placed before this unit when it follows another unit in the same chunk. */
  sep: string;
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) pieces.push(text.slice(i, i + maxChars));
  return pieces;
}

/** Breaks text into units no longer than maxChars: paragraphs, then sentences, then hard cuts. */
function toUnits(text: string, maxChars: number): Unit[] {
  const units: Unit[] = [];
  for (const para of text.split(/\n{2,}/)) {
    if (para.length <= maxChars) {
      units.push({ text: para, sep: "\n\n" });
      continue;
    }
    const sentences = para.split(/(?<=[.!?])\s+/);
    sentences.forEach((sentence, i) => {
      const sep = i === 0 ? "\n\n" : " ";
      if (sentence.length <= maxChars) {
        units.push({ text: sentence, sep });
      } else {
        hardSplit(sentence, maxChars).forEach((piece, j) =>
          units.push({ text: piece, sep: j === 0 ? sep : "" }),
        );
      }
    });
  }
  return units;
}

/** Last ~`size` chars of `text`, starting on a word boundary when possible. */
function tail(text: string, size: number): string {
  if (size <= 0) return "";
  if (text.length <= size) return text;
  let start = text.length - size;
  if (!/\s/.test(text[start - 1])) {
    const nextSpace = text.slice(start).search(/\s/);
    if (nextSpace !== -1) start += nextSpace + 1;
  }
  return text.slice(start).trimStart();
}

/**
 * Splits a document into overlapping chunks for embedding. Prefers paragraph
 * boundaries, then sentence boundaries, and only hard-cuts text that has neither.
 */
export function chunkText(input: string, options: ChunkOptions = {}): string[] {
  const { maxChars, overlap } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  if (maxChars <= 0) throw new Error("maxChars must be positive");
  if (overlap < 0 || overlap >= maxChars) {
    throw new Error("overlap must be >= 0 and smaller than maxChars");
  }

  const text = normalize(input);
  if (!text) return [];

  const chunks: string[] = [];
  let current = "";

  for (const unit of toUnits(text, maxChars)) {
    if (!current) {
      current = unit.text;
      continue;
    }
    if (current.length + unit.sep.length + unit.text.length <= maxChars) {
      current += unit.sep + unit.text;
      continue;
    }
    chunks.push(current);
    // Seed the next chunk with the end of this one, shrunk so the unit still fits.
    const room = maxChars - unit.text.length - 1;
    const seed = tail(current, Math.min(overlap, room));
    current = seed ? `${seed} ${unit.text}` : unit.text;
  }
  if (current) chunks.push(current);
  return chunks;
}
