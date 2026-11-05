import type { Metadata } from "next";
import { ChatUI } from "./chat-ui";

export const metadata: Metadata = {
  title: "Chat · RAG Tech Helper",
  description: "Ask a question and get a simple, grounded answer",
};

export default function ChatPage() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col bg-white dark:bg-black">
        <header className="flex flex-col gap-1 border-b border-black/10 px-4 py-6 dark:border-white/15 sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Tech Helper Chat
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ask a tech question in plain language and get simple, step-by-step help.
          </p>
        </header>
        <ChatUI />
      </main>
    </div>
  );
}
