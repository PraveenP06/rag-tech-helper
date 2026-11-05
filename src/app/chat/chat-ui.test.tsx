import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatUI } from "./chat-ui";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

async function ask(user: ReturnType<typeof userEvent.setup>, question: string) {
  await user.type(screen.getByLabelText("Type your question"), question);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("ChatUI", () => {
  it("shows the empty state before any message is sent", () => {
    render(<ChatUI />);

    expect(screen.getByText("Ask a question to get started")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("disables Send until there is non-whitespace text", async () => {
    const user = userEvent.setup();
    render(<ChatUI />);

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type your question"), "   ");
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText("Type your question"), "How do I call my grandson?");
    expect(sendButton).toBeEnabled();
  });

  it("does not call the backend for whitespace-only input", async () => {
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ChatUI />);

    await user.type(screen.getByLabelText("Type your question"), "   ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Ask a question to get started")).toBeInTheDocument();
  });

  it("shows a pending state while waiting, then clears it once the answer arrives", async () => {
    vi.stubGlobal("fetch", fetchMock);
    let resolveFetch: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ChatUI />);

    await user.type(screen.getByLabelText("Type your question"), "How do I call my grandson?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();

    resolveFetch(jsonResponse(200, { grounded: true, answer: "Here you go.", sources: [] }));

    expect(await screen.findByText("Here you go.")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    // Button reverts to "Send" once the request settles; it stays disabled because the
    // input was cleared on submit, not because a request is still pending.
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("posts the question to /api/chat and renders an answer with no sources", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        grounded: false,
        answer: "I’m not sure based on the guides I have. Please ask someone you trust for help.",
        sources: [],
      }),
    );
    const user = userEvent.setup();
    render(<ChatUI />);

    const input = screen.getByLabelText("Type your question");
    await ask(user, "How do I call my grandson?");

    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "How do I call my grandson?" }),
    });
    expect(input).toHaveValue("");
    expect(screen.getByText("How do I call my grandson?")).toBeInTheDocument();
    expect(
      await screen.findByText("I’m not sure based on the guides I have. Please ask someone you trust for help."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
  });

  it("renders one clickable source for a grounded answer", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        grounded: true,
        answer: "Press the green button to answer a call.",
        sources: [{ documentId: "doc-1", title: "Calling guide", sourceUrl: "https://example.com/calling" }],
      }),
    );
    const user = userEvent.setup();
    render(<ChatUI />);
    await ask(user, "How do I answer a call?");

    expect(await screen.findByText("Press the green button to answer a call.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Calling guide" });
    expect(link).toHaveAttribute("href", "https://example.com/calling");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders multiple sources, each linked and labeled, for a grounded answer", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        grounded: true,
        answer: "Here are a couple of ways to do that.",
        sources: [
          { documentId: "doc-1", title: "Calling guide", sourceUrl: "/documents/doc-1" },
          { documentId: "doc-2", title: "Texting guide", sourceUrl: "/documents/doc-2" },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<ChatUI />);
    await ask(user, "How do I call or text?");

    await screen.findByText("Here are a couple of ways to do that.");
    const callingLink = screen.getByRole("link", { name: "Calling guide" });
    const textingLink = screen.getByRole("link", { name: "Texting guide" });
    expect(callingLink).toHaveAttribute("href", "/documents/doc-1");
    expect(callingLink).not.toHaveAttribute("target");
    expect(textingLink).toHaveAttribute("href", "/documents/doc-2");
  });

  it("shows the server's error message when the request fails", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Unable to answer your question right now." }));
    const user = userEvent.setup();
    render(<ChatUI />);
    await ask(user, "How do I call my grandson?");

    expect(await screen.findByText("Unable to answer your question right now.")).toBeInTheDocument();
  });

  it("shows a friendly message when the network request itself fails", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ChatUI />);
    await ask(user, "How do I call my grandson?");

    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
  });

  it("supports multiple messages in a conversation", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { grounded: true, answer: "First answer.", sources: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { grounded: true, answer: "Second answer.", sources: [] }));
    const user = userEvent.setup();
    render(<ChatUI />);

    await ask(user, "First question");
    expect(await screen.findByText("First answer.")).toBeInTheDocument();
    await ask(user, "Second question");
    expect(await screen.findByText("Second answer.")).toBeInTheDocument();

    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("Second question")).toBeInTheDocument();
    expect(screen.getByRole("list").children).toHaveLength(4);
  });
});
