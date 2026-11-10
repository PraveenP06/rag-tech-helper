import { cleanup, render, screen, within } from "@testing-library/react";
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
  sessionStorage.clear();
});

async function setup() {
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<IngestForms />);
  await user.type(screen.getByLabelText("Ingest API key"), "k1");
  return user;
}

describe("IngestForms", () => {
  it("submits pasted text as JSON and shows the result", async () => {
    const user = await setup();
    respond(201, { status: "ready", documentId: "doc-1", title: "My note", chunkCount: 3 });

    await user.type(screen.getByLabelText("Title"), "My note");
    await user.type(screen.getByLabelText("Content"), "Server components render on the server.");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/text", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer k1" },
      body: JSON.stringify({ title: "My note", content: "Server components render on the server." }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/Ingested “My note” as 3 chunks/);
    expect(screen.getByRole("status")).toHaveTextContent("doc-1");
  });

  it("uploads a chosen file as multipart form data", async () => {
    const user = await setup();
    respond(201, { status: "ready", documentId: "doc-2", title: "Guide", chunkCount: 1 });

    const file = new File(["# Guide"], "guide.md", { type: "text/markdown" });
    await user.upload(screen.getByLabelText(/Or upload a file/), file);
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ingest/text");
    expect(init.headers).toEqual({ authorization: "Bearer k1" });
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(await screen.findByRole("status")).toHaveTextContent(/1 chunk\b/);
  });

  it("switches to the URL tab and submits a URL", async () => {
    const user = await setup();
    respond(200, { status: "duplicate", documentId: "doc-3", title: "Docs", existingStatus: "ready" });

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://nextjs.org/docs");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/url", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer k1" },
      body: JSON.stringify({ url: "https://nextjs.org/docs" }),
    });
    expect(await screen.findByRole("status")).toHaveTextContent(/already in the knowledge base/i);
  });

  it("shows the server's error message", async () => {
    const user = await setup();
    respond(400, { error: 'Unsupported file type ".pdf"' });

    await user.type(screen.getByLabelText("Title"), "x");
    await user.type(screen.getByLabelText("Content"), "y");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('Unsupported file type ".pdf"');
  });

  it("reports network failures", async () => {
    const user = await setup();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });

  it("remembers the API key for the browser session", async () => {
    await setup();
    expect(sessionStorage.getItem("ingest-api-key")).toBe("k1");
    cleanup();
    render(<IngestForms />);
    expect(await screen.findByLabelText("Ingest API key")).toHaveValue("k1");
  });

  it("shows what cleaning did after ingesting", async () => {
    const user = await setup();
    respond(201, {
      status: "ready",
      documentId: "doc-4",
      title: "Wi-Fi",
      chunkCount: 2,
      cleaning: { originalChars: 1200, cleanedChars: 950, boilerplateLinesRemoved: 12, duplicateBlocksRemoved: 2, sectionsMerged: 3 },
    });

    await user.type(screen.getByLabelText("Title"), "Wi-Fi");
    await user.type(screen.getByLabelText("Content"), "Body");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cleaned: removed 12 boilerplate lines and 2 duplicate blocks; merged 3 small sections (1,200 → 950 characters).",
    );
  });

  it("previews pasted text without ingesting it", async () => {
    const user = await setup();
    respond(200, {
      status: "preview",
      title: "Wi-Fi",
      cleanedContent: "Open Settings.",
      chunks: ["Wi-Fi\n\nOpen Settings.", "Wi-Fi > Android\n\nOpen Quick Settings."],
      cleaning: { originalChars: 40, cleanedChars: 30, boilerplateLinesRemoved: 1, duplicateBlocksRemoved: 0, sectionsMerged: 0 },
    });

    await user.type(screen.getByLabelText("Title"), "Wi-Fi");
    await user.type(screen.getByLabelText("Content"), "Copy\nOpen Settings.");
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/ingest/text?preview=1", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer k1" },
      body: JSON.stringify({ title: "Wi-Fi", content: "Copy\nOpen Settings." }),
    });
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Preview of “Wi-Fi”: 2 chunks. Nothing was saved.");
    expect(status).toHaveTextContent("Cleaned: removed 1 boilerplate line");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Wi-Fi\n\nOpen Settings.",
      "Wi-Fi > Android\n\nOpen Quick Settings.",
    ]);
  });

  it("warns when a previewed document would be rejected", async () => {
    const user = await setup();
    respond(200, {
      status: "preview",
      title: "Note",
      cleanedContent: "Short.",
      chunks: ["Note\n\nShort."],
      cleaning: { originalChars: 20, cleanedChars: 6, boilerplateLinesRemoved: 0, duplicateBlocksRemoved: 0, sectionsMerged: 0 },
      wouldReject: { reason: "Document has too little readable text after cleaning (5 characters; at least 100 needed)" },
    });

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://example.com");
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(fetchMock.mock.calls[0][0]).toBe("/api/ingest/url?preview=1");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This would be rejected: Document has too little readable text after cleaning",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Cleaned: no boilerplate or duplicates found (20 → 6 characters).");
  });
});

describe("IngestForms usability", () => {
  const ready = { status: "ready", documentId: "doc-9", title: "Note", chunkCount: 2 };

  async function pasteAndIngest(user: Awaited<ReturnType<typeof setup>>) {
    await user.type(screen.getByLabelText("Title"), "Note");
    await user.type(screen.getByLabelText("Content"), "Body text.");
    await user.click(screen.getByRole("button", { name: "Ingest text" }));
  }

  it("links to the stored document and to chat after ingesting", async () => {
    const user = await setup();
    respond(201, ready);
    await pasteAndIngest(user);

    const status = await screen.findByRole("status");
    expect(within(status).getByRole("link", { name: "View document" })).toHaveAttribute("href", "/documents/doc-9");
    expect(within(status).getByRole("link", { name: "Ask about it in chat" })).toHaveAttribute("href", "/chat");
  });

  it("links to the existing document for duplicates", async () => {
    const user = await setup();
    respond(200, { status: "duplicate", documentId: "old-1", title: "Note", existingStatus: "ready" });
    await pasteAndIngest(user);

    const status = await screen.findByRole("status");
    expect(within(status).getByRole("link", { name: "View document" })).toHaveAttribute("href", "/documents/old-1");
  });

  it("keeps what you typed when switching tabs", async () => {
    const user = await setup();
    await user.type(screen.getByLabelText("Content"), "Draft text");
    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "https://example.com");
    await user.click(screen.getByRole("tab", { name: "Text or file" }));

    expect(screen.getByLabelText("Content")).toHaveValue("Draft text");
    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    expect(screen.getByLabelText("Page URL")).toHaveValue("https://example.com");
  });

  it("switches tabs with the arrow keys", async () => {
    const user = await setup();
    await user.click(screen.getByRole("tab", { name: "Text or file" }));
    await user.keyboard("{ArrowRight}");

    const urlTab = screen.getByRole("tab", { name: "Web page URL" });
    expect(urlTab).toHaveAttribute("aria-selected", "true");
    expect(urlTab).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Text or file" })).toHaveFocus();
  });

  it("asks for a title before sending pasted text", async () => {
    const user = await setup();
    await user.type(screen.getByLabelText("Content"), "Body text.");
    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Add a title for pasted text.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveFocus();
  });

  it("explains the disabled text box and lets you remove a chosen file", async () => {
    const user = await setup();
    await user.upload(screen.getByLabelText(/Or upload a file/), new File(["# Guide"], "guide.md", { type: "text/markdown" }));

    expect(screen.getByLabelText("Content")).toBeDisabled();
    expect(screen.getByText(/Using guide\.md\. Remove the file to paste text instead\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove file" }));
    expect(screen.getByLabelText("Content")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Remove file" })).not.toBeInTheDocument();

    respond(201, ready);
    await pasteAndIngest(user);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ "content-type": "application/json", authorization: "Bearer k1" });
  });

  it("points at the key field when the key is rejected", async () => {
    const user = await setup();
    respond(401, { error: "Missing or invalid ingest API key" });
    await pasteAndIngest(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The ingest API key wasn't accepted. Paste the full INGEST_API_KEY value from .env.local into the key field above.",
    );
  });

  it("asks for the key before sending anything", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<IngestForms />);
    await pasteAndIngest(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the ingest API key first.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can show the key to check it was pasted fully", async () => {
    const user = await setup();
    const key = screen.getByLabelText("Ingest API key");
    expect(key).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Show key" }));
    expect(key).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide key" }));
    expect(key).toHaveAttribute("type", "password");
  });

  it("states the size limits and explains a too-large error plainly", async () => {
    const user = await setup();
    expect(screen.getByText(/up to 1 MB/)).toBeInTheDocument();
    respond(413, { error: "Content is too large (limit 1000000 bytes)" });
    await pasteAndIngest(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too large: pasted text and files can be up to 1 MB.");

    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    expect(screen.getByText(/up to 2 MB/)).toBeInTheDocument();
    respond(413, { error: "Page is too large (limit 2000000 bytes)" });
    await user.type(screen.getByLabelText("Page URL"), "https://example.com/big");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That page is too large: web pages can be up to 2 MB.");
  });

  it("adds https:// when the address has no scheme", async () => {
    const user = await setup();
    respond(201, ready);
    await user.click(screen.getByRole("tab", { name: "Web page URL" }));
    await user.type(screen.getByLabelText("Page URL"), "cyberseniors.org");
    await user.click(screen.getByRole("button", { name: "Ingest page" }));

    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ url: "https://cyberseniors.org" }));
    expect(screen.getByLabelText("Page URL")).toHaveValue("https://cyberseniors.org");
  });

  it("clears the last result once you start editing", async () => {
    const user = await setup();
    respond(201, ready);
    await pasteAndIngest(user);
    expect(await screen.findByRole("status")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Content"), " More.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
