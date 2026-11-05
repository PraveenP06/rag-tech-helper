/** Documents with fewer letters/digits than this after cleaning are rejected. */
export const MIN_DOCUMENT_CHARS = 100;
/** Sections with fewer letters/digits than this are merged into a neighbour rather than chunked alone. */
export const MIN_SECTION_CHARS = 200;

/** Counts letters and digits in any script: a measure of real content, ignoring markup and punctuation. */
export function meaningfulLength(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}
