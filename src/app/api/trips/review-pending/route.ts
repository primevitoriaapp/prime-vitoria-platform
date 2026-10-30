import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Corridas que a central precisa revisar (local não confirmado pelo GPS). */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data } = await db
      .from("trips")
      .select("id, scheduled_at, origin_text, destination_text, review_reason, operational_status")
      .eq("tenant_id", tenantId)
      .eq("review_required", true)
      .order("scheduled_at", { ascending: false })
      .limit(30);
    return ok({ items: data ?? [] });
  } catch (error) {
    return mapApiError(error);
  }
}
