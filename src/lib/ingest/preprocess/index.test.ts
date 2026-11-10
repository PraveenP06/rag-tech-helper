// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { RawDocument } from "../types";
import { preprocessDocument } from "./index";

const messy = [
  "﻿---\ntitle: Wi-Fi help\n---\n# Connect to Wi-Fi\r\n\r\nSkip to main content",
  "We use cookies to improve this guide. Accept to continue.",
  "Open [Settings](https://example.test/settings) and tap ![the gear](gear.png)  **Wi-Fi**. Pick your network.",
  "Copy\n```bash\nnetworksetup  -setairportpower en0 on\n```",
  "If it still fails, restart the router and try again in a minute.",
  "<!-- editor note -->",
  "If it still fails, restart the router and try again in a minute.\n\n\n",
].join("\n\n");

const raw: RawDocument = { sourceType: "upload", sourceRef: "wifi.md", title: "Connect to Wi-Fi", content: messy };

describe("preprocessDocument", () => {
  it("cleans a realistic messy document end to end", () => {
    const { document, report } = preprocessDocument(raw);
    const cleaned = [
      "# Connect to Wi-Fi",
      "Open Settings and tap the gear **Wi-Fi**. Pick your network.",
      "```bash\nnetworksetup  -setairportpower en0 on\n```",
      "If it still fails, restart the router and try again in a minute.",
    ].join("\n\n");
    expect(document).toEqual({ ...raw, content: cleaned });
    expect(report).toEqual({
      originalChars: messy.length,
      cleanedChars: cleaned.length,
      boilerplateLinesRemoved: 3,
      duplicateBlocksRemoved: 1,
    });
  });

  it("cleans the title", () => {
    const { document } = preprocessDocument({ ...raw, title: "  Wi-Fi  help ​\n" });
    expect(document.title).toBe("Wi-Fi help");
  });

  it("keeps the original title if cleaning would leave it empty", () => {
    expect(preprocessDocument({ ...raw, title: "​" }).document.title).toBe("​");
  });

  it("returns empty content for a document that is only boilerplate", () => {
    const { document } = preprocessDocument({ ...raw, content: "Copy\n\nBack to top\n" });
    expect(document.content).toBe("");
  });
});
