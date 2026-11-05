"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { AnswerQuestionResult, AnswerSource } from "@/lib/rag/answer";

type Role = "user" | "assistant";
type MessageStatus = "done" | "pending" | "error";

type Message = {
  id: string;
  role: Role;
  text: string;
  status: MessageStatus;
  sources?: readonly AnswerSource[];
};

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Calls the existing /api/chat endpoint built in src/app/api/chat/route.ts. */
async function askBackend(question: string): Promise<AnswerQuestionResult> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
  } catch {
    throw new Error("Could not reach the server. Please check your connection and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as AnswerQuestionResult;
}

const bubbleBaseClass = "max-w-[80%] rounded-2xl px-4 py-3 text-lg leading-relaxed break-words";

function SourceList({ sources }: { sources: readonly AnswerSource[] }) {
  return (
    <div className="mt-3 border-t border-black/10 pt-2 dark:border-white/15">
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Sources</p>
      <ul className="mt-1 flex flex-col gap-1">
        {sources.map((source) => {
          const isExternal = /^https?:\/\//i.test(source.sourceUrl);
          return (
            <li key={source.documentId}>
              <a
                href={source.sourceUrl}
                className="text-base text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {source.title}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isError = message.status === "error";

  const srPrefix = isUser
    ? "You said: "
    : isPending
      ? "Assistant is thinking: "
      : isError
        ? "Something went wrong: "
        : "Assistant said: ";

  const toneClass = isUser
    ? "bg-foreground text-background"
    : isError
      ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
      : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <li className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`${bubbleBaseClass} ${toneClass} ${isPending ? "animate-pulse" : ""}`}>
        <span className="sr-only">{srPrefix}</span>
        {message.text}
        {!isPending && !isError && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}
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
  const [pending, setPending] = useState(false);
  const inputId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  // Keeps the newest message in view as the conversation grows.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;

    const userMessage: Message = { id: createId(), role: "user", text, status: "done" };
    const pendingId = createId();
    const pendingMessage: Message = { id: pendingId, role: "assistant", text: "Thinking…", status: "pending" };

    setMessages((current) => [...current, userMessage, pendingMessage]);
    setDraft("");
    setPending(true);

    askBackend(text)
      .then((result) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === pendingId
              ? { ...message, text: result.answer, status: "done", sources: result.sources }
              : message,
          ),
        );
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Something went wrong. Please try again.";
        setMessages((current) =>
          current.map((entry) => (entry.id === pendingId ? { ...entry, text: message, status: "error" } : entry)),
        );
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="flex flex-1 flex-col">
      {messages.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          ref={listRef}
          aria-live="polite"
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 sm:px-8"
        >
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
          disabled={pending || !draft.trim()}
          className="min-h-12 rounded-full bg-foreground px-6 text-lg font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
