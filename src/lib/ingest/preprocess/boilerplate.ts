import { hasCodeToken, isListItem, withCodeProtected } from "./fences";
import { meaningfulLength } from "./quality";

/** Lines that are only one of these (ignoring case and trailing punctuation) are site UI, not content. */
const UI_PHRASES = new Set([
  "copy", "copy code", "copy to clipboard", "copied", "copy link",
  "skip to content", "skip to main content", "skip to navigation", "skip navigation",
  "edit this page", "edit on github", "edit page", "improve this page", "suggest an edit",
  "was this page helpful", "was this article helpful", "was this helpful", "did this help",
  "did this answer your question", "thank you for your feedback", "thanks for your feedback", "yes no",
  "on this page", "in this article", "table of contents", "contents",
  "back to top", "scroll to top", "return to top",
  "advertisement", "sponsored", "loading",
  "share", "share this", "share this page", "print", "print this page",
  "accept all cookies", "accept cookies", "reject all", "manage cookies", "cookie settings",
]);

const COOKIE_BANNER_MAX_CHARS = 400;
const COOKIE_SUBJECT = /\b(?:we|this (?:web)?site|our (?:web)?site)\s+uses?\s+cookies\b/i;
const COOKIE_ASK = /\b(?:accept|consent|agree|cookie (?:policy|settings|preferences)|privacy policy)\b/i;

const DUPLICATE_MIN_CHARS = 40;
const REPEATED_LINE_MAX_CHARS = 80;
const REPEATED_LINE_MIN_COUNT = 3;

// Callout labels repeat on purpose and change the meaning of what follows them.
const CALLOUT_LABEL =
  /^\W*(?:good to know|note|notes|warning|caution|important|tip|tips|info|danger|remember|heads up|example)\W*$/i;

const HEADING = /^ {0,3}#{1,6}\s/;
const TABLE_ROW = /^\s*\|/;
// GFM table separator such as "--- | :---:" or "|---|---|"; tables may omit the outer pipes.
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;
// A line that is nothing but a placeholder for a code block.
const CODE_BLOCK_LINE = /^\s*\d+\s*$/;
// Longer than any UI phrase, so long lines skip the (otherwise quadratic) trailing-punctuation strip.
const UI_PHRASE_MAX_CHARS = 60;

export interface BoilerplateResult {
  text: string;
  linesRemoved: number;
  duplicatesRemoved: number;
}

const uiPhrase = (line: string) => {
  const trimmed = line.trim();
  return trimmed.length <= UI_PHRASE_MAX_CHARS && UI_PHRASES.has(trimmed.toLowerCase().replace(/[\s:.!?…]+$/, ""));
};

/** Lines that are structure or content by definition, whatever they repeat or say. */
const isProtectedLine = (line: string) =>
  HEADING.test(line) || isListItem(line) || TABLE_ROW.test(line) || hasCodeToken(line);

/**
 * Indexes of lines that are content because of where they sit: every row of a table (found by its
 * separator row, so tables without a leading pipe count) and a label like "Output" just before code.
 */
function protectedByContext(lines: string[]): Set<number> {
  const keep = new Set<number>();
  lines.forEach((line, i) => {
    if (TABLE_SEPARATOR.test(line)) {
      for (let j = i; j >= 0 && lines[j].trim(); j--) keep.add(j);
      for (let j = i + 1; j < lines.length && lines[j].trim(); j++) keep.add(j);
    } else if (CODE_BLOCK_LINE.test(line)) {
      let j = i - 1;
      while (j >= 0 && !lines[j].trim()) j--;
      if (j >= 0) keep.add(j);
    }
  });
  return keep;
}

const isCookieBanner = (paragraph: string) =>
  paragraph.length < COOKIE_BANNER_MAX_CHARS && COOKIE_SUBJECT.test(paragraph) && COOKIE_ASK.test(paragraph);

/**
 * Removes site chrome that survives extraction: UI-phrase lines ("Copy", "Back to top"),
 * cookie-consent banners, repeated paragraphs and short lines repeated 3+ times.
 * Headings, list items/steps, table rows, labels just before code, and code are never removed.
 */
export function removeBoilerplate(text: string): BoilerplateResult {
  let linesRemoved = 0;
  let duplicatesRemoved = 0;

  const cleaned = withCodeProtected(text, (prose) => {
    // (a) UI-phrase lines.
    const lines = prose.split("\n").filter((line) => {
      const drop = !isProtectedLine(line) && uiPhrase(line);
      if (drop) linesRemoved++;
      return !drop;
    });

    // (b) cookie banners and (c) duplicate paragraphs.
    const seen = new Set<string>();
    const paragraphs = lines
      .join("\n")
      .split(/\n[ \t]*\n/)
      .filter((paragraph) => {
        const trimmed = paragraph.trim();
        if (!trimmed || hasCodeToken(trimmed) || (HEADING.test(trimmed) && !trimmed.includes("\n"))) {
          return true;
        }
        if (isCookieBanner(trimmed)) {
          linesRemoved += trimmed.split("\n").length;
          return false;
        }
        if (meaningfulLength(trimmed) < DUPLICATE_MIN_CHARS) return true;
        const key = trimmed.replace(/\s+/g, " ").toLowerCase();
        if (seen.has(key)) {
          duplicatesRemoved++;
          return false;
        }
        seen.add(key);
        return true;
      });

    // (d) short lines repeated 3+ times keep their first occurrence.
    const remaining = paragraphs.join("\n\n").split("\n");
    const keyOf = (line: string) => line.trim().toLowerCase();
    const inContext = protectedByContext(remaining);
    const candidate = (line: string, i: number) =>
      line.trim() !== "" &&
      line.trim().length <= REPEATED_LINE_MAX_CHARS &&
      !isProtectedLine(line) &&
      !inContext.has(i) &&
      !CALLOUT_LABEL.test(line.trim());
    const counts = new Map<string, number>();
    remaining.forEach((line, i) => {
      if (candidate(line, i)) counts.set(keyOf(line), (counts.get(keyOf(line)) ?? 0) + 1);
    });
    const kept = new Set<string>();
    return remaining
      .filter((line, i) => {
        if (!candidate(line, i) || (counts.get(keyOf(line)) ?? 0) < REPEATED_LINE_MIN_COUNT) return true;
        if (kept.has(keyOf(line))) {
          linesRemoved++;
          return false;
        }
        kept.add(keyOf(line));
        return true;
      })
      .join("\n");
  });

  return { text: cleaned, linesRemoved, duplicatesRemoved };
}
