import type { Metadata } from "next";
import { IngestForms } from "./ingest-forms";

export const metadata: Metadata = {
  title: "Ingest · RAG Tech Helper",
  description: "Add documents to the knowledge base",
};

export default function IngestPage() {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 bg-white px-8 py-16 dark:bg-black">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Add to the knowledge base
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Paste text, upload a markdown or text file, or point at a web page. Each document is split
            into chunks and stored in Pinecone, which embeds them for search.
          </p>
        </header>
        <IngestForms />
      </main>
    </div>
  );
}
