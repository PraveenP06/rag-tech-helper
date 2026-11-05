import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSupabase } from "@/lib/clients";
import { findDocumentById } from "@/lib/ingest/document-repo";

export const metadata: Metadata = {
  title: "Document · RAG Tech Helper",
};

function Origin({ sourceType, sourceRef }: { sourceType: string; sourceRef: string }) {
  if (sourceType === "url") {
    return (
      <>
        Scraped from{" "}
        <a href={sourceRef} className="underline" rel="noopener noreferrer" target="_blank">
          {sourceRef}
        </a>
      </>
    );
  }
  return <>{sourceRef === "pasted-text" ? "Pasted text" : `Uploaded file: ${sourceRef}`}</>;
}

/** Fetches and renders one stored document. Exported for tests. */
export async function DocumentDetails({ id }: { id: string }) {
  const doc = await findDocumentById(getSupabase(), id);
  if (!doc) notFound();

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">{doc.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Origin sourceType={doc.sourceType} sourceRef={doc.sourceRef} /> · added{" "}
          {new Date(doc.createdAt).toLocaleDateString("en", { dateStyle: "medium" })}
        </p>
      </header>
      <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-zinc-800 dark:text-zinc-200">
        {doc.content}
      </div>
    </article>
  );
}

async function DocumentFromParams({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetails id={id} />;
}

/** Shows an ingested document. Chat links here as the source for uploaded and pasted content. */
export default function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <div className="flex flex-1 justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col bg-white px-8 py-16 dark:bg-black">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading document…</p>}>
          <DocumentFromParams params={params} />
        </Suspense>
      </main>
    </div>
  );
}
