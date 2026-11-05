import { withCodeProtected } from "./fences";

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
// Only URL-looking targets, so prose like "[Note]: remember" is left alone.
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]+<?(?:[a-z]+:|\/|#|\.\.?\/)\S*.*(?:\n|$)/gim;
const LINK_TARGET = String.raw`\(\s*<?([^)\s>]*)>?(?:\s+["'(][^)\n]*["')])?\s*\)`;
const IMAGE = new RegExp(String.raw`!\[([^\]\n]*)\]` + LINK_TARGET, "g");
const LINK = new RegExp(String.raw`\[([^\]\n]*)\]` + LINK_TARGET, "g");
const REFERENCE_LINK = /\[([^\]\n]+)\]\[[^\]\n]*\]/g;
const AUTOLINK = /<((?:https?|mailto):[^>\s]+)>/gi;
const TAG = /<\/?([a-z][a-z0-9]*)\b(?:\s[^<>]*)?\/?>/gi;

// A fixed list, so placeholders like <your-password> or <user>@<host> are never mistaken for HTML.
const BLOCK_TAGS = new Set([
  "div", "p", "section", "article", "table", "tr", "td", "th", "tbody", "thead", "ul", "ol", "li",
  "details", "summary", "center", "br",
]);
const INLINE_TAGS = new Set(["span", "a", "img", "b", "i", "em", "strong", "u", "sup", "sub", "small", "font", "kbd"]);

const ENTITIES: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#0*39;|&apos;/g, "'"],
  [/&amp;/g, "&"], // last, so "&amp;lt;" becomes "&lt;" rather than "<"
];

function stripFrontMatter(text: string): string {
  const match = FRONT_MATTER.exec(text);
  if (!match) return text;
  const firstLine = match[1].split("\n").find((line) => line.trim());
  return firstLine && /^[\w-]+\s*:/.test(firstLine) ? text.slice(match[0].length) : text;
}

/**
 * Markup that adds nothing to retrieval: front matter, comments, link/image syntax (the visible
 * text stays), reference definitions and inline HTML from a known tag list. Code is untouched.
 */
export function stripMarkdownNoise(text: string): string {
  return withCodeProtected(stripFrontMatter(text), (prose) => {
    let out = prose
      .replace(HTML_COMMENT, "")
      .replace(REFERENCE_DEFINITION, "")
      .replace(IMAGE, (_, alt: string) => alt.trim())
      .replace(LINK, (_, label: string, url: string) => label.trim() || url)
      .replace(REFERENCE_LINK, "$1")
      .replace(AUTOLINK, "$1")
      .replace(TAG, (tag, name: string) => {
        const lower = name.toLowerCase();
        if (BLOCK_TAGS.has(lower)) return "\n";
        if (INLINE_TAGS.has(lower)) return "";
        return tag;
      });
    for (const [entity, char] of ENTITIES) out = out.replace(entity, char);
    return out;
  });
}
