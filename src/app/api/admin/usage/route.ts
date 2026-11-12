import { getUsageOverview } from "@/lib/admin/usage-store";
import { getUsageSupabaseClient } from "@/lib/admin/supabase";
import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { IngestError } from "@/lib/ingest/errors";

export const GET = async (request: Request): Promise<Response> => {
  try {
    assertIngestAuthorized(request);
  } catch (error: unknown) {
    if (error instanceof IngestError) {
      const status = error.kind === "unauthorized" ? 401 : error.kind === "unavailable" ? 503 : 500;
      const headers: HeadersInit = error.kind === "unauthorized" ? { "www-authenticate": "Bearer" } : {};
      return Response.json({ error: error.message }, { status, headers });
    }
    throw error;
  }

  const client = getUsageSupabaseClient();
  if (!client) {
    return Response.json({ error: "Usage logging is not configured." }, { status: 503 });
  }

  try {
    const overview = await getUsageOverview(client);
    return Response.json(overview);
  } catch (error: unknown) {
    console.error("Admin usage request failed.", error);
    return Response.json({ error: "Unable to load usage logs." }, { status: 500 });
  }
};
