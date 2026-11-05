import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key, which bypasses RLS.
 * Returns undefined when the env vars are missing so callers can degrade
 * gracefully: usage logging must never break chat, and the admin view reports
 * "not configured" instead of crashing.
 */
export const getUsageSupabaseClient = (): SupabaseClient | undefined => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return undefined;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
