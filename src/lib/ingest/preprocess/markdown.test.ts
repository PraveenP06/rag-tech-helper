// @vitest-environment node
import { describe, expect, it } from "vitest";
import { stripMarkdownNoise } from "./markdown";

describe("stripMarkdownNoise", () => {
  it("removes YAML front matter at the very start only", () => {
    expect(stripMarkdownNoise("---\ntitle: Wi-Fi help\ntags: [network]\n---\n# Wi-Fi\nBody")).toBe(
      "# Wi-Fi\nBody",
    );
    const rule = "Intro\n\n---\ntitle: not front matter\n---\nMore";
    expect(stripMarkdownNoise(rule)).toBe(rule);
  });

  it("keeps a leading horizontal rule that isn't YAML", () => {
    const text = "---\nJust a paragraph between rules.\n---\nEnd";
    expect(stripMarkdownNoise(text)).toBe(text);
  });

  it("replaces links with their text, keeping the URL when there is no other text", () => {
    expect(stripMarkdownNoise('Open [Settings](https://x.test/s "tip") now')).toBe("Open Settings now");
    expect(stripMarkdownNoise("See [https://x.test](https://x.test).")).toBe("See https://x.test.");
    expect(stripMarkdownNoise("See [](https://x.test).")).toBe("See https://x.test.");
    expect(stripMarkdownNoise("Visit <https://x.test/help>.")).toBe("Visit https://x.test/help.");
    expect(stripMarkdownNoise("Read [the guide][g] first.")).toBe("Read the guide first.");
  });

  it("replaces images with their alt text, or drops them", () => {
    expect(stripMarkdownNoise("Tap ![the gear icon](gear.png) then ![](x.png)go")).toBe(
      "Tap the gear icon then go",
    );
  });

  it("drops reference-link definitions and HTML comments", () => {
    expect(stripMarkdownNoise("Text\n\n[g]: https://x.test/guide\n<!-- todo:\nfix -->\nEnd")).toBe(
      "Text\n\n\nEnd",
    );
  });

  it("strips known HTML tags but keeps their text and angle-bracket placeholders", () => {
    expect(stripMarkdownNoise('<div class="note">Hold <b>Power</b><br>then <kbd>Ctrl</kbd></div>')).toBe(
      "\nHold Power\nthen Ctrl\n",
    );
    expect(stripMarkdownNoise("Type <your-password> and ssh <user>@<host>")).toBe(
      "Type <your-password> and ssh <user>@<host>",
    );
  });

  it("decodes common HTML entities after stripping tags", () => {
    expect(stripMarkdownNoise("Fish&nbsp;&amp;&nbsp;chips &lt;b&gt;")).toBe("Fish & chips <b>");
  });

  it("never changes code", () => {
    const text = "```html\n<div>[a](b) <!-- c --></div>\n```\n\nRun `<b>[x](y)</b>`";
    expect(stripMarkdownNoise(text)).toBe(text);
  });
});
