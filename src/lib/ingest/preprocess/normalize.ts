import { withCodeProtected } from "./fences";

// Invisible characters break copied commands, so these are removed everywhere, code included.
// ZWNJ and ZWJ (U+200C, U+200D) stay: some scripts and emoji sequences need them.
const INVISIBLE = /[\uFEFF\u200B\u2060\u00AD]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const UNICODE_SPACES = /[  -   　]/g;
const LIGATURES: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl" };

// trimEnd per line rather than /[ \t]+$/gm, which is quadratic on long runs of spaces.
const trimLineEnds = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

/**
 * Character-level cleanup: line endings, NFC (not NFKC, so `x²` and full-width text survive),
 * invisible/control characters, ligatures and odd spaces. Outside code it also collapses space
 * runs, trims line ends and squeezes blank lines, keeping leading indentation for nested lists.
 */
export function normalizeText(text: string): string {
  const chars = text
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(CONTROL, "")
    .replace(/[ﬀﬁﬂﬃﬄ]/g, (lig) => LIGATURES[lig])
    .replace(UNICODE_SPACES, " ");

  return withCodeProtected(chars, (prose) =>
    trimLineEnds(prose)
      .replace(/(?<=\S)[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n"),
  ).replace(/^\s*\n/, "").trimEnd();
}
