import { z } from "zod";
import { IngestError } from "../errors";
import type { RawDocument } from "../types";

export const MAX_TEXT_BYTES = 1_000_000;
export const ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;

const MAX_TITLE_CHARS = 200;

const pastedTextSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(MAX_TITLE_CHARS),
  content: z.string().refine((s) => s.trim().length > 0, "Content is required"),
});

function assertSize(text: string, label: string) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > MAX_TEXT_BYTES) {
    throw new IngestError(`${label} is too large (limit ${MAX_TEXT_BYTES} bytes)`, "too_large");
  }
}

/** Method 1a: text pasted directly into the form or sent as JSON. */
export function fromText(input: unknown): RawDocument {
  const parsed = pastedTextSchema.safeParse(input);
  if (!parsed.success) {
    throw new IngestError(parsed.error.issues.map((i) => i.message).join("; "), "validation");
  }
  assertSize(parsed.data.content, "Content");
  return {
    sourceType: "upload",
    sourceRef: "pasted-text",
    title: parsed.data.title,
    content: parsed.data.content,
  };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function firstHeading(markdown: string): string | undefined {
  return markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() || undefined;
}

/** Method 1b: an uploaded .md / .txt file. */
export async function fromFile(file: File, title?: string | null): Promise<RawDocument> {
  const ext = extensionOf(file.name);
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new IngestError(
      `Unsupported file type "${ext || file.name}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      "validation",
    );
  }
  if (file.size > MAX_TEXT_BYTES) {
    throw new IngestError(`File is too large (limit ${MAX_TEXT_BYTES} bytes)`, "too_large");
  }

  const content = await file.text();
  if (content.includes("\u0000")) {
    throw new IngestError("File looks like binary data, not text", "validation");
  }
  if (!content.trim()) {
    throw new IngestError("File is empty", "validation");
  }

  const stem = ext ? file.name.slice(0, -ext.length) : file.name;
  const resolvedTitle = (title?.trim() || firstHeading(content) || stem).slice(0, MAX_TITLE_CHARS);
  return { sourceType: "upload", sourceRef: file.name, title: resolvedTitle, content };
}
