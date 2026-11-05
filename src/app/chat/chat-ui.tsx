"use client";

import { useId, useState, type FormEvent } from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  text: string;
};

// Static placeholder replies for visual testing only. Replaced by a real
// API call once the chat backend is wired up on a later branch.
const SAMPLE_REPLIES = [
  "Here's what I found in the guides I have. Let me know if that helps.",
  "I'm not sure based on the guides I have. Please ask someone you trust for help.",
  "Here are a couple of simple steps you can try next.",
];

let nextSampleReply = 0;

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const bubbleBaseClass = "max-w-[80%] rounded-2xl px-4 py-3 text-lg leading-relaxed break-words";

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`${bubbleBaseClass} ${
          isUser
            ? "bg-foreground text-background"
            : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
        }`}
      >
        <span className="sr-only">{isUser ? "You said: " : "Assistant said: "}</span>
        {message.text}
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-xl font-semibold text-zinc-800 dark:text-zinc-100">
        Ask a question to get started
      </p>
      <p className="max-w-sm text-base text-zinc-600 dark:text-zinc-400">
        For example: &ldquo;How do I video call my grandson?&rdquo; or &ldquo;How do I make my
        phone text bigger?&rdquo;
      </p>
    </div>
  );
}

export function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const userMessage: Message = { id: createId(), role: "user", text };
    const replyMessage: Message = {
      id: createId(),
      role: "assistant",
      text: SAMPLE_REPLIES[nextSampleReply % SAMPLE_REPLIES.length],
    };
    nextSampleReply += 1;

    setMessages((current) => [...current, userMessage, replyMessage]);
    setDraft("");
  };

  return (
    <div className="flex flex-1 flex-col">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ul>
      )}

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-3 border-t border-black/10 bg-white px-4 py-4 dark:border-white/15 dark:bg-black sm:px-8"
      >
        <label htmlFor={inputId} className="sr-only">
          Type your question
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          placeholder="Type your question here…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-12 flex-1 rounded-full border border-black/10 bg-white px-5 text-lg text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="min-h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          Send
        </button>
      </form>
    </div>
  );
}
