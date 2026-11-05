import { getUsageOverview } from "@/lib/admin/usage-store";
import { getUsageSupabaseClient } from "@/lib/admin/supabase";

export const GET = async (): Promise<Response> => {
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
