import { createHash } from "node:crypto";

/** sha256 of the content with all whitespace runs collapsed, so formatting-only changes dedupe. */
export function contentHash(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
