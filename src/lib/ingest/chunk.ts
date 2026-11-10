import { MIN_SECTION_CHARS, meaningfulLength } from "./preprocess/quality";
import { type Section, splitSections } from "./sections";

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

/** Drops trailing spaces and tabs with a scan, since /[ \t]+\n/ is quadratic on long runs of spaces. */
function trimTrailingBlanks(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t")) end--;
  return line.slice(0, end);
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(trimTrailingBlanks)
    .join("\n")
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

// ---------------------------------------------------------------------------
// Section-aware chunking with a context line
// ---------------------------------------------------------------------------

export interface DocumentChunks {
  /** Each chunk is `<title > heading path>\n\n<body>`, at most maxChars long. */
  chunks: string[];
  sectionsMerged: number;
}

const MAX_PREFIX_CHARS = 200;

function contextPrefix(title: string, headingPath: string[], maxChars: number): string {
  // Skip a heading that repeats the part before it, e.g. an H1 equal to the title.
  const parts = [title.trim(), ...headingPath].filter(
    (part, i, all) => part && (i === 0 || part.toLowerCase() !== all[i - 1].toLowerCase()),
  );
  const prefix = parts.join(" > ");
  const cap = Math.min(MAX_PREFIX_CHARS, Math.floor(maxChars / 4));
  return prefix.length > cap ? `${prefix.slice(0, cap - 1).trimEnd()}…` : prefix;
}

const headingLine = (section: Section) =>
  `${"#".repeat(Math.min(6, Math.max(1, section.level)))} ${section.headingPath[section.headingPath.length - 1]}`;

function commonPath(a: string[], b: string[]): string[] {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return a.slice(0, n);
}

/**
 * Joins `next` onto `target` under their shared heading path, writing any heading that drops out
 * of the path into the body so its context isn't lost. Returns null if the result won't fit.
 */
function merged(target: Section, next: Section, title: string, maxChars: number): Section | null {
  const path = commonPath(target.headingPath, next.headingPath);
  const parts: string[] = [];
  if (target.headingPath.length > path.length) parts.push(headingLine(target));
  parts.push(target.body);
  if (next.headingPath.length > path.length) parts.push(headingLine(next));
  parts.push(next.body);
  const body = parts.join("\n\n");
  const prefix = contextPrefix(title, path, maxChars);
  if (body.length + prefix.length + 2 > maxChars) return null;
  return { headingPath: path, level: path.length, body };
}

const isSmall = (section: Section) => meaningfulLength(section.body) < MIN_SECTION_CHARS;

/**
 * Splits a cleaned document into chunks that stay inside one section and start with a
 * `Title > Heading > Subheading` line, so each chunk makes sense on its own. Sections too small
 * to stand alone are merged into the next section (or the previous one, at the end).
 */
export function chunkDocument(content: string, title: string, options: ChunkOptions = {}): DocumentChunks {
  const { maxChars, overlap } = { ...DEFAULT_CHUNK_OPTIONS, ...options };
  const sections: Section[] = [];
  let sectionsMerged = 0;

  for (const section of splitSections(content)) {
    const prev = sections[sections.length - 1];
    const joined = prev && isSmall(prev) ? merged(prev, section, title, maxChars) : null;
    if (joined) {
      sections[sections.length - 1] = joined;
      sectionsMerged++;
    } else {
      sections.push(section);
    }
  }
  if (sections.length > 1 && isSmall(sections[sections.length - 1])) {
    const joined = merged(sections[sections.length - 2], sections[sections.length - 1], title, maxChars);
    if (joined) {
      sections.splice(-2, 2, joined);
      sectionsMerged++;
    }
  }

  const chunks = sections.flatMap((section) => {
    const prefix = contextPrefix(title, section.headingPath, maxChars);
    const bodyMax = prefix ? maxChars - prefix.length - 2 : maxChars;
    const pieces = chunkText(section.body, { maxChars: bodyMax, overlap: Math.min(overlap, Math.floor(bodyMax / 2)) });
    return pieces.map((piece) => (prefix ? `${prefix}\n\n${piece}` : piece));
  });
  return { chunks, sectionsMerged };
}
