import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";

/** Situação de revisão da corrida (motorista não confirmou o local pelo GPS). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data } = await db.from("trips").select("review_required, review_reason, reviewed_at").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}

/** A central marca a corrida como revisada. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { error } = await db
      .from("trips")
      .update({ review_required: false, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    return ok({ reviewed: true });
  } catch (error) {
    return mapApiError(error);
  }
}
