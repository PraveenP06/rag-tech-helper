"use client";

import { useState, type FormEvent } from "react";
import type { IngestResult } from "@/lib/ingest/types";

type Outcome = { kind: "result"; result: IngestResult } | { kind: "error"; message: string } | null;
type Tab = "text" | "url";

const inputClass =
  "w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100";
const buttonClass =
  "rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors " +
  "hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";

async function send(url: string, init: RequestInit): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { kind: "error", message: "Could not reach the server. Is `npm run dev` running?" };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { kind: "error", message: body?.error ?? `Request failed with status ${res.status}` };
  }
  return { kind: "result", result: body as IngestResult };
}

function OutcomeView({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  if (outcome.kind === "error") {
    return (
      <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        {outcome.message}
      </p>
    );
  }
  const { result } = outcome;
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      {result.status === "ready" ? (
        <>
          Ingested “{result.title}” as {result.chunkCount} {result.chunkCount === 1 ? "chunk" : "chunks"}.
        </>
      ) : (
        <>
          “{result.title}” is already in the knowledge base (status: {result.existingStatus}).
        </>
      )}{" "}
      <span className="font-mono text-xs opacity-75">id {result.documentId}</span>
    </p>
  );
}

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const run = async (url: string, init: RequestInit) => {
    setPending(true);
    setOutcome(null);
    setOutcome(await send(url, init));
    setPending(false);
  };
  return { pending, outcome, run };
}

function TextForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { pending, outcome, run } = useSubmit();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (file) {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title);
      return run("/api/ingest/text", { method: "POST", body: form });
    }
    return run("/api/ingest/text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-title" className="text-sm font-medium">Title</label>
        <input id="ingest-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-xs text-zinc-500">Optional for files: defaults to the first heading or the filename.</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-content" className="text-sm font-medium">Content</label>
        <textarea
          id="ingest-content"
          rows={8}
          className={`${inputClass} font-mono`}
          value={content}
          disabled={file !== null}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-file" className="text-sm font-medium">Or upload a file (.md, .markdown, .txt)</label>
        <input
          id="ingest-file"
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Ingesting…" : "Ingest text"}
        </button>
      </div>
      <OutcomeView outcome={outcome} />
    </form>
  );
}

function UrlForm() {
  const [url, setUrl] = useState("");
  const { pending, outcome, run } = useSubmit();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    return run("/api/ingest/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-url" className="text-sm font-medium">Page URL</label>
        <input
          id="ingest-url"
          type="url"
          required
          placeholder="https://nextjs.org/docs/app/getting-started"
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-xs text-zinc-500">Fetches one public page and keeps its main text.</p>
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? "Ingesting…" : "Ingest page"}
        </button>
      </div>
      <OutcomeView outcome={outcome} />
    </form>
  );
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "text", label: "Text or file" },
  { id: "url", label: "Web page URL" },
];

export function IngestForms() {
  const [tab, setTab] = useState<Tab>("text");
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Ingestion method" className="flex gap-2">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-foreground text-background"
                : "border border-black/10 hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "text" ? <TextForm /> : <UrlForm />}
      </div>
    </div>
  );
}
