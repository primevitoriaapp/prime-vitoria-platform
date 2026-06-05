import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

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
        tenant_id: trip.tenant_id
      },
      session.driverId
    );
    const denied = denyUnlessTripReadable(access);
    if (denied) return denied;

    return ok(trip);
  } catch (error) {
    return mapApiError(error);
  }
}
