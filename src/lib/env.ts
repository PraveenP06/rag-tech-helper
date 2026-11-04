import { z } from "zod";

const required = z.string().trim().min(1, "is required");

const envSchema = z.object({
  GOOGLE_GENERATIVE_AI_API_KEY: required,
  PINECONE_API_KEY: required,
  PINECONE_INDEX: required,
  PINECONE_NAMESPACE: z.string().trim().min(1).default("default"),
  SUPABASE_URL: z.url("must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: required,
});

export type Env = z.infer<typeof envSchema>;

type EnvSource = Record<string, string | undefined>;

/**
 * Validates server-side env vars. Call it inside request handlers, never at
 * module top level, so builds and tests don't need real credentials.
 */
export function getEnv(source: EnvSource = process.env): Env {
  // Treat empty strings as unset so `.default()` and "is required" behave as expected.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Missing or invalid environment variables:\n${problems}`);
  }
  return result.data;
}
