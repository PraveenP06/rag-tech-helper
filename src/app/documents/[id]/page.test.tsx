import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findDocumentById = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ingest/document-repo", () => ({ findDocumentById }));
vi.mock("@/lib/clients", () => ({ getSupabase: () => ({ fake: true }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { DocumentDetails } from "./page";

const doc = {
  id: "868d1b2a-a7e1-4104-8a21-625be9cd1de9",
  title: "Turning on Wi-Fi",
  sourceType: "upload",
  sourceRef: "wifi-guide.md",
  content: "1. Swipe down.\n2. Tap the Wi-Fi icon.",
  createdAt: "2026-11-05T10:00:00Z",
};

beforeEach(() => findDocumentById.mockReset());

describe("DocumentDetails", () => {
  it("shows an uploaded document's title, origin and full text", async () => {
    findDocumentById.mockResolvedValue(doc);
    render(await DocumentDetails({ id: doc.id }));

    expect(findDocumentById).toHaveBeenCalledWith({ fake: true }, doc.id);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Turning on Wi-Fi");
    expect(screen.getByText(/Uploaded file: wifi-guide\.md/)).toBeInTheDocument();
    expect(screen.getByText(/Tap the Wi-Fi icon/)).toBeInTheDocument();
  });

  it("links scraped documents to the original page", async () => {
    findDocumentById.mockResolvedValue({ ...doc, sourceType: "url", sourceRef: "https://nextjs.org/docs" });
    render(await DocumentDetails({ id: doc.id }));
    expect(screen.getByRole("link", { name: "https://nextjs.org/docs" })).toHaveAttribute(
      "href",
      "https://nextjs.org/docs",
    );
  });

  it("labels pasted text", async () => {
    findDocumentById.mockResolvedValue({ ...doc, sourceRef: "pasted-text" });
    render(await DocumentDetails({ id: doc.id }));
    expect(screen.getByText(/Pasted text/)).toBeInTheDocument();
  });

  it("404s for unknown documents", async () => {
    findDocumentById.mockResolvedValue(null);
    await expect(DocumentDetails({ id: doc.id })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
