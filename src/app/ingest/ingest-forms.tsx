"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import type { CleaningReport, IngestResult, PreviewResult } from "@/lib/ingest/types";

type Result = IngestResult | PreviewResult;
type Outcome = { kind: "result"; result: Result } | { kind: "error"; message: string } | null;
type Tab = "text" | "url";
type Action = "ingest" | "preview";

const inputClass =
  "w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100";
const buttonClass =
  "rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors " +
  "hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";
const secondaryButtonClass =
  "rounded-full border border-black/10 px-5 py-2 text-sm font-medium transition-colors " +
  "hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.06]";

// The ingest API key lives in sessionStorage so it survives reloads but not the browser session.
// useSyncExternalStore keeps the prerendered HTML (empty key) and the client in agreement.
const KEY_STORAGE = "ingest-api-key";
const KEY_EVENT = "ingest-api-key-change";

function subscribeToKey(onChange: () => void) {
  window.addEventListener(KEY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(KEY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function useApiKey(): [string, (key: string) => void] {
  const key = useSyncExternalStore(
    subscribeToKey,
    () => sessionStorage.getItem(KEY_STORAGE) ?? "",
    () => "",
  );
  const setKey = (next: string) => {
    sessionStorage.setItem(KEY_STORAGE, next);
    window.dispatchEvent(new Event(KEY_EVENT));
  };
  return [key, setKey];
}

const authHeader = (apiKey: string): Record<string, string> =>
  apiKey ? { authorization: `Bearer ${apiKey}` } : {};

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
  return { kind: "result", result: body as Result };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Cleaned: removed 12 boilerplate lines and 2 duplicate blocks; merged 3 small sections (1,200 → 950 characters)." */
function cleaningSummary(c: CleaningReport): string {
  const removed = [
    c.boilerplateLinesRemoved > 0 && plural(c.boilerplateLinesRemoved, "boilerplate line"),
    c.duplicateBlocksRemoved > 0 && plural(c.duplicateBlocksRemoved, "duplicate block"),
  ].filter(Boolean);
  const parts = [
    removed.length > 0 && `removed ${removed.join(" and ")}`,
    c.sectionsMerged > 0 && `merged ${plural(c.sectionsMerged, "small section")}`,
  ].filter(Boolean);
  const chars = `${c.originalChars.toLocaleString("en-US")} → ${c.cleanedChars.toLocaleString("en-US")} characters`;
  return `Cleaned: ${parts.length ? parts.join("; ") : "no boilerplate or duplicates found"} (${chars}).`;
}

function PreviewView({ result }: { result: PreviewResult }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950 dark:text-sky-100">
      <p>
        Preview of “{result.title}”: {plural(result.chunks.length, "chunk")}. Nothing was saved.
      </p>
      {result.wouldReject && (
        <p className="font-medium text-amber-800 dark:text-amber-200">This would be rejected: {result.wouldReject.reason}</p>
      )}
      <p className="text-xs opacity-75">{cleaningSummary(result.cleaning)}</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        {result.chunks.map((chunk, i) => (
          <li key={i}>
            <pre className="whitespace-pre-wrap rounded bg-white/70 p-2 font-mono text-xs dark:bg-black/30">{chunk}</pre>
          </li>
        ))}
      </ol>
    </div>
  );
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
  if (result.status === "preview") return <PreviewView result={result} />;
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
      {result.cleaning && <span className="mt-1 block text-xs opacity-75">{cleaningSummary(result.cleaning)}</span>}
    </p>
  );
}

/** Both buttons send the same request; Preview adds `?preview=1` so nothing is stored. */
function useSubmit(url: string, buildInit: () => RequestInit) {
  const [pending, setPending] = useState<Action | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const run = async (action: Action) => {
    setPending(action);
    setOutcome(null);
    setOutcome(await send(action === "preview" ? `${url}?preview=1` : url, buildInit()));
    setPending(null);
  };
  return { pending, outcome, run };
}

function Buttons({ pending, run, label }: { pending: Action | null; run: (a: Action) => void; label: string }) {
  return (
    <div className="flex gap-3">
      <button type="submit" className={buttonClass} disabled={pending !== null}>
        {pending === "ingest" ? "Ingesting…" : label}
      </button>
      <button type="button" className={secondaryButtonClass} disabled={pending !== null} onClick={() => run("preview")}>
        {pending === "preview" ? "Previewing…" : "Preview"}
      </button>
    </div>
  );
}

function TextForm({ apiKey }: { apiKey: string }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { pending, outcome, run } = useSubmit("/api/ingest/text", () => {
    if (file) {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title);
      return { method: "POST", headers: authHeader(apiKey), body: form };
    }
    return {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeader(apiKey) },
      body: JSON.stringify({ title, content }),
    };
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    return run("ingest");
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
      <Buttons pending={pending} run={run} label="Ingest text" />
      <OutcomeView outcome={outcome} />
    </form>
  );
}

function UrlForm({ apiKey }: { apiKey: string }) {
  const [url, setUrl] = useState("");
  const { pending, outcome, run } = useSubmit("/api/ingest/url", () => ({
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader(apiKey) },
    body: JSON.stringify({ url }),
  }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    return run("ingest");
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
      <Buttons pending={pending} run={run} label="Ingest page" />
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
  const [apiKey, setApiKey] = useApiKey();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-api-key" className="text-sm font-medium">Ingest API key</label>
        <input
          id="ingest-api-key"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="text-xs text-zinc-500">
          The server&apos;s INGEST_API_KEY. Kept in this browser tab&apos;s session storage only.
        </p>
      </div>
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
        {tab === "text" ? <TextForm apiKey={apiKey} /> : <UrlForm apiKey={apiKey} />}
      </div>
    </div>
  );
}
