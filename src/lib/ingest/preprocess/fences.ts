/**
 * Code protection for the cleaning steps. Commands and code samples matter in a tech helper, so
 * cleaning must never reflow, rewrite or drop them. Fenced blocks, indented code blocks and inline
 * code spans are swapped for placeholders while a step runs, then restored unchanged.
 */

export interface Block {
  code: boolean;
  text: string;
}

// Any indentation: fences nested under list items are indented 4+ spaces (MkDocs requires it).
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const INDENTED = /^(?: {4}|\t)/;
const INLINE_CODE = /(?<!`)(`+)(?!`)[^\n]*?(?<!`)\1(?!`)/g;
const TOKEN = /(\d+)/g;
const STRAY_TOKEN_CHARS = /[]/g;

export const isListItem = (line: string) => LIST_ITEM.test(line);
export const hasCodeToken = (text: string) => /\d+/.test(text);

/** Splits text into prose and code blocks (fenced or indented). Joining the texts with "\n" gives back the input. */
export function splitBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length) blocks.push({ code: false, text: prose.join("\n") });
    prose = [];
  };

  let inList = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const marker = fence[1];
      const close = new RegExp(`^[ \\t]*${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
      let end = i + 1;
      while (end < lines.length && !close.test(lines[end])) end++;
      flushProse();
      blocks.push({ code: true, text: lines.slice(i, Math.min(end + 1, lines.length)).join("\n") });
      i = end + 1;
      inList = false;
      continue;
    }

    const afterBlank = i === 0 || lines[i - 1].trim() === "";
    if (INDENTED.test(line) && line.trim() && afterBlank && !inList) {
      let end = i;
      while (end + 1 < lines.length && (INDENTED.test(lines[end + 1]) || !lines[end + 1].trim())) end++;
      while (!lines[end].trim()) end--; // trailing blank lines belong to the prose after it
      flushProse();
      blocks.push({ code: true, text: lines.slice(i, end + 1).join("\n") });
      i = end + 1;
      continue;
    }

    if (line.trim()) {
      if (isListItem(line)) inList = true;
      else if (!/^\s/.test(line)) inList = false;
    }
    prose.push(line);
    i++;
  }
  flushProse();
  return blocks;
}

/**
 * Runs `fn` over the text with every piece of code replaced by an opaque placeholder
 * (block code gets a line of its own), then puts the code back exactly as it was.
 */
export function withCodeProtected(text: string, fn: (prose: string) => string): string {
  const saved: string[] = [];
  const token = (code: string) => `${saved.push(code) - 1}`;

  const masked = splitBlocks(text.replace(STRAY_TOKEN_CHARS, ""))
    .map((block) => (block.code ? token(block.text) : block.text.replace(INLINE_CODE, token)))
    .join("\n");

  return fn(masked).replace(TOKEN, (_, n: string) => saved[Number(n)] ?? "");
}
