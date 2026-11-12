"use client";

import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import type { CleaningReport, IngestResult, PreviewResult } from "@/lib/ingest/types";

type Result = IngestResult | PreviewResult;
type Outcome = { kind: "result"; result: Result } | { kind: "error"; message: string } | null;
type Tab = "text" | "url";
type Action = "ingest" | "preview";
/** A request ready to send, or the reason it can't be sent (and the field to fix). */
type Prepared = { init: RequestInit } | { error: string; focus?: HTMLElement | null };

const inputClass =
  "w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100";
const buttonClass =
  "rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors " +
  "hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]";
const secondaryButtonClass =
  "rounded-full border border-black/10 px-5 py-2 text-sm font-medium transition-colors " +
  "hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.06]";
const smallButtonClass =
  "shrink-0 rounded-md border border-black/10 px-3 py-2 text-xs font-medium transition-colors " +
  "hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]";
const hintClass = "text-xs text-zinc-500";

// Mirror the server limits: MAX_TEXT_BYTES in sources/text.ts and MAX_PAGE_BYTES in sources/url.ts.
const TEXT_TOO_LARGE = "Too large: pasted text and files can be up to 1 MB.";
const PAGE_TOO_LARGE = "That page is too large: web pages can be up to 2 MB.";
const KEY_MISSING = "Enter the ingest API key first.";
const KEY_REJECTED =
  "The ingest API key wasn't accepted. Paste the full INGEST_API_KEY value from .env.local into the key field above.";
const KEY_INPUT_ID = "ingest-api-key";

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

async function send(url: string, init: RequestInit, tooLarge: string): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    return { kind: "error", message: "Could not reach the server. Is `npm run dev` running?" };
  }
  const body = await res.json().catch(() => null);
  if (res.status === 401) return { kind: "error", message: KEY_REJECTED };
  if (res.status === 413) return { kind: "error", message: tooLarge };
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
    <div role="status" className="flex flex-col gap-1 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      <p>
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
      {result.cleaning && <p className="text-xs opacity-75">{cleaningSummary(result.cleaning)}</p>}
      <p className="flex gap-4 font-medium">
        <Link href={`/documents/${result.documentId}`} className="underline">
          View document
        </Link>
        <Link href="/chat" className="underline">
          Ask about it in chat
        </Link>
      </p>
    </div>
  );
}

/**
 * Both buttons send the same request; Preview adds `?preview=1` so nothing is stored.
 * Missing input is caught here, before anything is sent.
 */
function useSubmit(url: string, apiKey: string, tooLarge: string, prepare: () => Prepared) {
  const [pending, setPending] = useState<Action | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const fail = (message: string, focus?: HTMLElement | null) => {
    setOutcome({ kind: "error", message });
    focus?.focus();
  };
  const run = async (action: Action) => {
    if (!apiKey.trim()) return fail(KEY_MISSING, document.getElementById(KEY_INPUT_ID));
    const prepared = prepare();
    if ("error" in prepared) return fail(prepared.error, prepared.focus);
    setPending(action);
    setOutcome(null);
    setOutcome(await send(action === "preview" ? `${url}?preview=1` : url, prepared.init, tooLarge));
    setPending(null);
  };
  return { pending, outcome, run, clearOutcome: () => setOutcome(null) };
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
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, outcome, run, clearOutcome } = useSubmit("/api/ingest/text", apiKey, TEXT_TOO_LARGE, () => {
    if (file) {
      const form = new FormData();
      form.set("file", file);
      if (title.trim()) form.set("title", title);
      if (documentId.trim()) form.set("documentId", documentId.trim());
      return { init: { method: "POST", headers: authHeader(apiKey), body: form } };
    }
    if (!title.trim()) return { error: "Add a title for pasted text.", focus: titleRef.current };
    if (!content.trim()) return { error: "Paste some text or choose a file.", focus: contentRef.current };
    const body: { title: string; content: string; documentId?: string } = { title, content };
    if (documentId.trim()) body.documentId = documentId.trim();
    return {
      init: {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader(apiKey) },
        body: JSON.stringify(body),
      },
    };
  });

  const removeFile = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    clearOutcome();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    return run("ingest");
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-title" className="text-sm font-medium">Title</label>
        <input
          id="ingest-title"
          ref={titleRef}
          className={inputClass}
          value={title}
          aria-describedby="ingest-title-hint"
          onChange={(e) => {
            setTitle(e.target.value);
            clearOutcome();
          }}
        />
        <p id="ingest-title-hint" className={hintClass}>
          Required for pasted text. Optional for files: defaults to the first heading or the filename.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-content" className="text-sm font-medium">Content</label>
        <textarea
          id="ingest-content"
          ref={contentRef}
          rows={8}
          className={`${inputClass} font-mono disabled:opacity-60`}
          value={content}
          disabled={file !== null}
          aria-describedby={file ? "ingest-content-hint" : undefined}
          onChange={(e) => {
            setContent(e.target.value);
            clearOutcome();
          }}
        />
        {file && (
          <p id="ingest-content-hint" className={hintClass}>
            Using {file.name}. Remove the file to paste text instead.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-file" className="text-sm font-medium">Or upload a file (.md, .markdown, .txt)</label>
        <div className="flex items-center gap-3">
          <input
            id="ingest-file"
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              clearOutcome();
            }}
          />
          {file && (
            <button type="button" className={smallButtonClass} onClick={removeFile}>
              Remove file
            </button>
          )}
        </div>
        <p className={hintClass}>Pasted text and files can be up to 1 MB.</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-document-id" className="text-sm font-medium">Existing document ID (optional)</label>
        <input
          id="ingest-document-id"
          className={inputClass}
          placeholder="Leave blank to add a new source"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
        />
        <p className="text-xs text-zinc-500">Provide an existing ID to replace that source and preserve its citations.</p>
      </div>
      <Buttons pending={pending} run={run} label="Ingest text" />
      <OutcomeView outcome={outcome} />
    </form>
  );
}

/** "cyberseniors.org" → "https://cyberseniors.org"; addresses that already have a scheme are left alone. */
const withScheme = (raw: string) => {
  const url = raw.trim();
  return !url || /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
};

function UrlForm({ apiKey }: { apiKey: string }) {
  const [url, setUrl] = useState("");
  const [documentId, setDocumentId] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const { pending, outcome, run, clearOutcome } = useSubmit("/api/ingest/url", apiKey, PAGE_TOO_LARGE, () => {
    const address = withScheme(url);
    if (!address) return { error: "Enter a web page address.", focus: urlRef.current };
    setUrl(address);
    const body: { url: string; documentId?: string } = { url: address };
    if (documentId.trim()) body.documentId = documentId.trim();
    return {
      init: {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader(apiKey) },
        body: JSON.stringify(body),
      },
    };
  });

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
          ref={urlRef}
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://nextjs.org/docs/app/getting-started"
          className={inputClass}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            clearOutcome();
          }}
        />
        <p className={hintClass}>Fetches one public page (up to 2 MB) and keeps its main text.</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="ingest-url-document-id" className="text-sm font-medium">Existing document ID (optional)</label>
        <input
          id="ingest-url-document-id"
          className={inputClass}
          placeholder="Leave blank to add a new source"
          value={documentId}
          onChange={(e) => {
            setDocumentId(e.target.value);
            clearOutcome();
          }}
        />
        <p className="text-xs text-zinc-500">Provide an existing ID to replace that source and preserve its citations.</p>
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

const TAB_KEYS: Record<string, (i: number) => number> = {
  ArrowRight: (i) => (i + 1) % TABS.length,
  ArrowLeft: (i) => (i - 1 + TABS.length) % TABS.length,
  Home: () => 0,
  End: () => TABS.length - 1,
};

export function IngestForms() {
  const [tab, setTab] = useState<Tab>("text");
  const [apiKey, setApiKey] = useApiKey();
  const [showKey, setShowKey] = useState(false);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  // Arrow keys, Home and End move between tabs, as the ARIA tabs pattern expects.
  const onTabKeyDown = (event: KeyboardEvent) => {
    const move = TAB_KEYS[event.key];
    if (!move) return;
    event.preventDefault();
    const next = TABS[move(TABS.findIndex((t) => t.id === tab))].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <label htmlFor={KEY_INPUT_ID} className="text-sm font-medium">Ingest API key</label>
        <div className="flex gap-2">
          <input
            id={KEY_INPUT_ID}
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} font-mono`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            type="button"
            className={smallButtonClass}
            aria-label={showKey ? "Hide key" : "Show key"}
            onClick={() => setShowKey((shown) => !shown)}
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
        <p className={hintClass}>
          The server&apos;s INGEST_API_KEY. Kept in this browser tab&apos;s session storage only.
        </p>
      </div>
      <div role="tablist" aria-label="Ingestion method" className="flex gap-2" onKeyDown={onTabKeyDown}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
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
      {/* Both panels stay mounted (only hidden), so switching tabs keeps what was typed. */}
      {TABS.map(({ id }) => (
        <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={tab !== id}>
          {id === "text" ? <TextForm apiKey={apiKey} /> : <UrlForm apiKey={apiKey} />}
        </div>
      ))}
    </div>
  );
}
