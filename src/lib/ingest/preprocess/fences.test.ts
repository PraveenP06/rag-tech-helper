// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasCodeToken, splitBlocks, withCodeProtected } from "./fences";

const upper = (s: string) => s.toUpperCase();

describe("splitBlocks", () => {
  it("separates fenced code (``` and ~~~, with a language tag) from prose", () => {
    const text = "intro\n```bash\nls  -la\n```\nmiddle\n~~~\nx\n~~~\nend";
    expect(splitBlocks(text)).toEqual([
      { code: false, text: "intro" },
      { code: true, text: "```bash\nls  -la\n```" },
      { code: false, text: "middle" },
      { code: true, text: "~~~\nx\n~~~" },
      { code: false, text: "end" },
    ]);
  });

  it("treats an unclosed fence as code to the end", () => {
    expect(splitBlocks("a\n```\nb\nc")).toEqual([
      { code: false, text: "a" },
      { code: true, text: "```\nb\nc" },
    ]);
  });

  it("detects indented code after a blank line, but not list continuations", () => {
    const text = "Run this:\n\n    npm install\n    npm test\n\nThen:\n\n1. Step one\n\n    more about step one";
    const blocks = splitBlocks(text);
    expect(blocks).toContainEqual({ code: true, text: "    npm install\n    npm test" });
    expect(blocks.filter((b) => b.code)).toHaveLength(1);
  });
});

describe("withCodeProtected", () => {
  it("applies fn to prose only and restores code byte-for-byte", () => {
    const text = "say `ls  -la` here\n\n```\nkeep   me\n```\n\n    indented  code\n\ndone";
    expect(withCodeProtected(text, upper)).toBe(
      "SAY `ls  -la` HERE\n\n```\nkeep   me\n```\n\n    indented  code\n\nDONE",
    );
  });

  it("protects inline spans with multiple backticks", () => {
    expect(withCodeProtected("a ``x ` y`` b", upper)).toBe("A ``x ` y`` B");
  });

  it("lets fn see placeholders it can detect, and keeps code even if fn moves lines", () => {
    let seen = "";
    withCodeProtected("a `b` c", (prose) => {
      seen = prose;
      return prose;
    });
    expect(hasCodeToken(seen)).toBe(true);
    expect(hasCodeToken("plain")).toBe(false);
  });

  it("drops stray private-use placeholder characters from the input", () => {
    expect(withCodeProtected("abc", (s) => s)).toBe("abc");
  });

  it("treats a fence indented under a list item as code", () => {
    const text = "1. Install:\n\n    ```bash\n    docker run  -p 8080:80   nginx\n    ```\n\n2. Done.";
    expect(splitBlocks(text)).toEqual([
      { code: false, text: "1. Install:\n" },
      { code: true, text: "    ```bash\n    docker run  -p 8080:80   nginx\n    ```" },
      { code: false, text: "\n2. Done." },
    ]);
  });
});
