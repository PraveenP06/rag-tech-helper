import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChatUI } from "./chat-ui";

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

  it("adds a user bubble and a sample assistant reply on send, then clears the input", async () => {
    const user = userEvent.setup();
    render(<ChatUI />);

    const input = screen.getByLabelText("Type your question");
    await user.type(input, "How do I video call my grandson?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("How do I video call my grandson?")).toBeInTheDocument();
    expect(screen.getByRole("list").children).toHaveLength(2);
    expect(input).toHaveValue("");
    expect(screen.queryByText("Ask a question to get started")).not.toBeInTheDocument();
  });

  it("appends further messages to the conversation on subsequent sends", async () => {
    const user = userEvent.setup();
    render(<ChatUI />);

    const input = screen.getByLabelText("Type your question");
    await user.type(input, "First question");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(input, "Second question");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("First question")).toBeInTheDocument();
    expect(screen.getByText("Second question")).toBeInTheDocument();
    expect(screen.getByRole("list").children).toHaveLength(4);
  });
});
