import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { busyDriversForTrip } from "@/lib/dispatch/driver-schedule-check";

/** Quem já está ocupado no horário desta corrida (para a lista de motoristas da Agenda). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: trip } = await db.from("trips").select("id, scheduled_at, service_mode, planned_km").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    const busy = await busyDriversForTrip(tenantId, {
      id,
      scheduled_at: trip.scheduled_at as string,
      operational_status: "dispatched",
      service_mode: (trip.service_mode as string | null) ?? null,
      planned_km: (trip.planned_km as number | null) ?? null
    });
    return ok({ busy });
  } catch (error) {
    return mapApiError(error);
  }
}
