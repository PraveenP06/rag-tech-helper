import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IngestForms } from "./ingest-forms";

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function setup() {
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<IngestForms />);
  return user;
}

describe("IngestForms", () => {
  it("submits pasted text as JSON and shows the result", async () => {
    const user = setup();
    respond(201, { status: "ready", documentId: "doc-1", title: "My note", chunkCount: 3 });

    await user.type(screen.getByLabelText("Title"), "My note");
    await user.type(screen.getByLabelText("Content"), "Server components render on the server.");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "My note", content: "Server components render on the server." }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/Ingested “My note” as 3 chunks/);
    expect(screen.getByRole("status")).toHaveTextContent("doc-1");
  });

  it("uploads a chosen file as multipart form data", async () => {
    const user = setup();
    respond(201, { status: "ready", documentId: "doc-2", title: "Guide", chunkCount: 1 });

    const file = new File(["# Guide"], "guide.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText(/Or upload a file/), file);
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ingest/text");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(await screen.findByRole("status")).toHaveTextContent(/1 chunk\b/);
  });

  it("switches to the URL tab and submits a URL", async () => {
    const user = setup();
    respond(200, { status: "duplicate", documentId: "doc-3", title: "Docs", existingStatus: "ready" });

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://nextjs.org/docs");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://nextjs.org/docs" }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/already in the knowledge base/i);
  });

  it("shows the server's error message", async () => {
    const user = setup();
    respond(400, { error: 'Unsupported file type ".pdf"' });

    await user.type(screen.getByLabelText("Title"), "x");
    await user.type(screen.getByLabelText("Content"), "y");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('Unsupported file type ".pdf"');
  });

  it("reports network failures", async () => {
    const user = setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });
});
