"use client";

import { useState, useSyncExternalStore } from "react";

const KEY_STORAGE = "ingest-api-key";
const KEY_EVENT = "ingest-api-key-change";
const inputClass =
  "w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 " +
  "focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100";

function subscribe(onChange: () => void) {
  window.addEventListener(KEY_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(KEY_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function KnowledgeBaseControls() {
  const apiKey = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(KEY_STORAGE) ?? "",
    () => "",
  );
  const [pending, setPending] = useState<"clear" | "reload" | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);

  const saveKey = (value: string) => {
    sessionStorage.setItem(KEY_STORAGE, value);
    window.dispatchEvent(new Event(KEY_EVENT));
  };

  const run = async (action: "clear" | "reload") => {
    if (action === "clear" && !window.confirm(
      "Clear all chatbot knowledge base chunks? The stored source documents will remain available for reload.",
    )) return;
    setPending(action);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/knowledge-base", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const failures = Array.isArray(body?.failures)
          ? ` ${body.failures.map((failure: { title: string; error: string }) => `${failure.title}: ${failure.error}`).join("; ")}`
          : "";
        throw new Error(`${body?.error ?? `Request failed (${response.status})`}${failures}`);
      }
      setFeedback({
        error: false,
        message: action === "clear"
          ? "Knowledge base cleared. Source documents are retained for reload."
          : `Reload complete: ${body.reloaded} source(s) reindexed${body.failed ? `, ${body.failed} failed` : ""}.`,
      });
    } catch (error) {
      setFeedback({ error: true, message: error instanceof Error ? error.message : "Request failed." });
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-black/10 p-5 dark:border-white/15">
      <div>
        <h2 className="text-xl font-semibold">Knowledge base</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Clear searchable chunks or rebuild them from documents stored in Supabase.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="admin-ingest-key" className="text-sm font-medium">Admin API key</label>
        <input
          id="admin-ingest-key"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={apiKey}
          onChange={(event) => saveKey(event.target.value)}
        />
        <p className="text-xs text-zinc-500">Uses the INGEST_API_KEY and is kept in this browser tab only.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void run("clear")}
          disabled={pending !== null}
          className="rounded-full border border-red-300 px-5 py-2 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
        >
          {pending === "clear" ? "Clearing…" : "Clear knowledge base"}
        </button>
        <button
          type="button"
          onClick={() => void run("reload")}
          disabled={pending !== null}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending === "reload" ? "Reloading…" : "Reload from stored documents"}
        </button>
      </div>
      {feedback && (
        <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-sm text-red-700 dark:text-red-300" : "text-sm text-emerald-700 dark:text-emerald-300"}>
          {feedback.message}
        </p>
      )}
    </section>
  );
}
