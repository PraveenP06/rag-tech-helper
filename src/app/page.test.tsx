import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home, { metadata } from "./page";

describe("Home", () => {
  it("says what the helper is for", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Tech Helper");
    expect(screen.getByText(/plain-language, step-by-step help/i)).toBeInTheDocument();
  });

  it("leads with one clear way into the chat", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Ask a question" })).toHaveAttribute("href", "/chat");
  });

  it("lists the topics the guides cover", () => {
    render(<Home />);

    const topics = within(screen.getByRole("list", { name: "Things I can help with" }));
    for (const topic of ["Making text bigger", "Video calls with family", "Spotting scams"]) {
      expect(topics.getByText(topic)).toBeInTheDocument();
    }
  });

  it("keeps the team pages in a quiet footer", () => {
    render(<Home />);

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Add guides" })).toHaveAttribute("href", "/ingest");
    expect(footer.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin");
  });

  it("has a real page title", () => {
    expect(metadata.title).toBe("RAG Tech Helper");
  });
});
