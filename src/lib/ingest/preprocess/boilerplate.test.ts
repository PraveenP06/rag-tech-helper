// @vitest-environment node
import { describe, expect, it } from "vitest";
import { removeBoilerplate } from "./boilerplate";

const para = (n: number) => `Paragraph ${n} explains how to connect the printer to your Wi-Fi network.`;

describe("removeBoilerplate", () => {
  it("drops lines that are entirely a known UI phrase", () => {
    const text = [
      "Copy",
      "Copy code",
      "Skip to main content",
      "Edit this page",
      "Was this page helpful?",
      "Back to top",
      "Loading...",
      "Copy the file to your Desktop.",
    ].join("\n");
    expect(removeBoilerplate(text)).toEqual({
      text: "Copy the file to your Desktop.",
      linesRemoved: 7,
      duplicatesRemoved: 0,
    });
  });

  it("keeps UI phrases that are list items", () => {
    expect(removeBoilerplate("Menu options:\n- Copy\n- Share\n- Print").text).toBe(
      "Menu options:\n- Copy\n- Share\n- Print",
    );
  });

  it("drops cookie-consent banners but keeps help about cookies", () => {
    const banner = "We use cookies to improve your experience. By continuing, you accept our privacy policy.";
    const help = "To clear cookies, open Settings, then Safari, then Clear History. Your privacy settings stay the same.";
    const result = removeBoilerplate(`${banner}\n\n${help}`);
    expect(result.text).toBe(help);
    expect(result.linesRemoved).toBe(1);
  });

  it("keeps a long paragraph that discusses cookie consent", () => {
    const long = `We use cookies only when you accept them. ${"Cookies are small files websites save. ".repeat(12)}`;
    expect(removeBoilerplate(long).text).toBe(long);
  });

  it("removes exact duplicate paragraphs after their first occurrence", () => {
    const result = removeBoilerplate([para(1), para(2), para(1), "Short.", "Short."].join("\n\n"));
    expect(result.text).toBe([para(1), para(2), "Short.", "Short."].join("\n\n"));
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("keeps the first of a short line repeated 3 or more times, and keeps lines repeated twice", () => {
    const text = ["Sponsored by Acme", "a", "Sponsored by Acme", "b", "Sponsored by Acme", "Twice", "Twice"].join("\n");
    const result = removeBoilerplate(text);
    expect(result.text).toBe(["Sponsored by Acme", "a", "b", "Twice", "Twice"].join("\n"));
    expect(result.linesRemoved).toBe(2);
  });

  it("keeps repeated callout labels like Warning or Good to know", () => {
    const text = ["Warning", "Unplug first.", "Good to know:", "Tip A.", "Warning", "Keep it dry.", "Good to know:", "Tip B.", "Warning", "Wait.", "Good to know:", "Tip C."].join("\n\n");
    expect(removeBoilerplate(text).text).toBe(text);
  });

  it("never removes headings, list steps, table rows or code", () => {
    const section = (device: string) =>
      [`## ${device}`, "## Example", "1. Open Settings.", "| Wi-Fi | On |", "Run `ping 8.8.8.8`", "```\nreboot\n```"].join("\n\n");
    const text = ["iPhone", "Android", "iPad"].map(section).join("\n\n");
    expect(removeBoilerplate(text)).toEqual({ text, linesRemoved: 0, duplicatesRemoved: 0 });
  });

  it("never touches a code fence nested under a list item", () => {
    const text = "2. Then:\n\n    ```python\n    print\n    }\n    }\n    }\n    ```";
    expect(removeBoilerplate(text)).toEqual({ text, linesRemoved: 0, duplicatesRemoved: 0 });
  });

  it("keeps a repeated label that introduces code", () => {
    const fence = "```";
    const section = (n: string) =>
      `## ${n}\n\nOutput\n\n${fence}\nresult ${n}\n${fence}\n\nRun:\n\n${fence}\nrun ${n}\n${fence}`;
    const text = ["A", "B", "C"].map(section).join("\n\n");
    expect(removeBoilerplate(text)).toEqual({ text, linesRemoved: 0, duplicatesRemoved: 0 });
  });

  it("keeps the header rows of tables written without a leading pipe", () => {
    const table = (n: number) => `Name | Value\n--- | ---\nk${n} | v${n}`;
    const text = [1, 2, 3].map(table).join("\n\n");
    expect(removeBoilerplate(text)).toEqual({ text, linesRemoved: 0, duplicatesRemoved: 0 });
  });

  it("still removes a short non-table line with pipes that repeats", () => {
    const text = ["Home | About | Contact", para(1), "Home | About | Contact", para(2), "Home | About | Contact"].join("\n\n");
    // Leftover blank lines are squeezed by the normalize pass that runs after this step.
    const squeezed = removeBoilerplate(text).text.replace(/\n{3,}/g, "\n\n").trim();
    expect(squeezed).toBe(["Home | About | Contact", para(1), para(2)].join("\n\n"));
  });

  it("handles very long lines of punctuation quickly", () => {
    const start = performance.now();
    removeBoilerplate(".".repeat(200_000) + "y\n\n" + " ".repeat(200_000) + "z");
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
