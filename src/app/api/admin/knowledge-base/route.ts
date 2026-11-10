import { getPineconeIndex, getSupabase } from "@/lib/clients";
import { assertIngestAuthorized } from "@/lib/ingest/auth";
import { IngestError } from "@/lib/ingest/errors";
import { clearKnowledgeBase, reloadKnowledgeBase } from "@/lib/admin/knowledge-base";

export const POST = async (request: Request): Promise<Response> => {
  try {
    assertIngestAuthorized(request);
    const body: unknown = await request.json().catch(() => null);
    const action = typeof body === "object" && body !== null && "action" in body
      ? (body as { action?: unknown }).action
      : undefined;
    if (action !== "clear" && action !== "reload") {
      return Response.json({ error: "Choose either clear or reload." }, { status: 400 });
    }

    const client = getSupabase();
    const index = getPineconeIndex();
    if (action === "clear") {
      await clearKnowledgeBase(client, index);
      return Response.json({ status: "cleared" });
    }

    const result = await reloadKnowledgeBase(client, index);
    return Response.json(result, { status: result.failed > 0 ? 502 : 200 });
  } catch (error: unknown) {
    if (error instanceof IngestError) {
      const status = error.kind === "unauthorized" ? 401 : error.kind === "unavailable" ? 503 : 500;
      const headers: HeadersInit = error.kind === "unauthorized" ? { "www-authenticate": "Bearer" } : {};
      return Response.json({ error: error.message }, { status, headers });
    }
    console.error("Admin knowledge base request failed.", error);
    return Response.json({ error: "Unable to update the knowledge base. Check server logs." }, { status: 500 });
  }
};
