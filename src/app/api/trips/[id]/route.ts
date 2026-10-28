import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { redactTripMoneyForRole } from "@/lib/trips/list-trips-for-session";
import { enrichTripListItems } from "@/lib/trips/enrich-trip-list";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    const { id } = await params;
    const tenantId = assertTenantScope(session);

    const { data: trip, error } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (error || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const access = tripGetAccess(
      session,
      {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id,
        created_by: (trip.created_by as string | null | undefined) ?? null
      },
      session.driverId
    );
    const denied = denyUnlessTripReadable(access);
    if (denied) return denied;

    const [visible] = redactTripMoneyForRole([trip as Record<string, unknown>], session.role);
    // Nome do motorista e veículo (para o detalhe no portal e no app).
    const [enriched] = await enrichTripListItems([visible as typeof visible & { client_id: string }]).catch(() => [visible]);
    return ok(enriched ?? visible);
  } catch (error) {
    return mapApiError(error);
  }
}
