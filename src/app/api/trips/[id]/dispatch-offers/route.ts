import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { listDispatchOffersForTrip } from "@/lib/dispatch/list-trip-offers";
import { db } from "@/lib/server/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "dispatch");
    const tenantId = assertTenantScope(session);
    const { id: tripId } = await params;

    const { data: trip } = await db
      .from("trips")
      .select("id, client_id, driver_id, tenant_id")
      .eq("id", tripId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Viagem nao encontrada", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    const offers = await listDispatchOffersForTrip(tripId, tenantId);
    return ok({ items: offers });
  } catch (error) {
    return mapApiError(error);
  }
}
