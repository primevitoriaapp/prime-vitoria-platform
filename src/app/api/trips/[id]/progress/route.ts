import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { buildProgress } from "@/lib/trips/trip-progress";

/** Andamento da corrida passo a passo (gestor do cliente, solicitante e central). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: trip } = await db
      .from("trips")
      .select("id, tenant_id, client_id, driver_id, created_by, created_at, operational_status")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id as string,
        driver_id: (trip.driver_id as string | null) ?? null,
        tenant_id: trip.tenant_id as string,
        created_by: (trip.created_by as string | null) ?? null
      })
    );
    if (denied) return denied;
    const { data: hist } = await db
      .from("trip_status_history")
      .select("to_status, changed_at")
      .eq("trip_id", id)
      .order("changed_at", { ascending: true })
      .limit(100);
    return ok(
      buildProgress(
        trip.operational_status as string,
        trip.created_at as string,
        (hist ?? []).map((h) => ({ to_status: h.to_status as string, changed_at: h.changed_at as string }))
      )
    );
  } catch (error) {
    return mapApiError(error);
  }
}
