import { z } from "zod";

const required = z.string({ error: "is required" }).trim().min(1, "is required");

const envSchema = z.object({
  PINECONE_API_KEY: required,
  PINECONE_INDEX: required,
  SUPABASE_URL: z.url({ error: (issue) => (issue.input === undefined ? "is required" : "must be a valid URL") }),
  SUPABASE_SERVICE_ROLE_KEY: required,
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

/**
 * Validates the server-side env vars ingestion needs. Call it inside request handlers, never at
 * module top level, so builds and tests don't need real credentials.
 */
export function getEnv(source: EnvSource = process.env): Env {
  // Treat empty strings as unset so they get the "is required" message.
  const cleaned: EnvSource = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  // Supabase's Next.js setup names the project URL NEXT_PUBLIC_SUPABASE_URL; accept either.
  cleaned.SUPABASE_URL ??= cleaned.NEXT_PUBLIC_SUPABASE_URL;
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${problems}`);
  }
  return result.data;
}
