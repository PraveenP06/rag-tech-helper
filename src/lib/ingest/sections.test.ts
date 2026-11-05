// @vitest-environment node
import { describe, expect, it } from "vitest";
import { splitSections } from "./sections";

describe("splitSections", () => {
  it("tracks the heading path and keeps text before the first heading", () => {
    const text = "Intro line\n\n# Guide\n\nTop\n\n## Setup ##\n\nSetup text\n\n### Install\n\nInstall text\n\n## Use\n\nUse text";
    expect(splitSections(text)).toEqual([
      { headingPath: [], level: 0, body: "Intro line" },
      { headingPath: ["Guide"], level: 1, body: "Top" },
      { headingPath: ["Guide", "Setup"], level: 2, body: "Setup text" },
      { headingPath: ["Guide", "Setup", "Install"], level: 3, body: "Install text" },
      { headingPath: ["Guide", "Use"], level: 2, body: "Use text" },
    ]);
  });

  it("ignores # lines inside code and keeps code in the section body", () => {
    const text = "## Shell\n\n```bash\n# not a heading\nls\n```\n\nAfter";
    expect(splitSections(text)).toEqual([
      { headingPath: ["Shell"], level: 2, body: "```bash\n# not a heading\nls\n```\n\nAfter" },
    ]);
  });

  it("drops headings with no body of their own", () => {
    expect(splitSections("# A\n\n## B\n\nText")).toEqual([
      { headingPath: ["A", "B"], level: 2, body: "Text" },
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(splitSections("")).toEqual([]);
  });
});
