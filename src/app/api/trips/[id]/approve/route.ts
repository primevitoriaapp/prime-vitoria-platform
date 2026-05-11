import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { canTransition } from "@/lib/domain/status";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const { id } = await params;

    const { data: trip, error: getError } = await db.from("trips").select("*").eq("id", id).single();
    if (getError || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, { client_id: trip.client_id, driver_id: trip.driver_id ?? null })
    );
    if (denied) return denied;

    if (!canTransition(trip.operational_status, "approved")) {
      return fail("INVALID_STATUS_TRANSITION", "Cannot approve trip", 409);
    }

    const { data, error } = await db
      .from("trips")
      .update({ operational_status: "approved", approved_by: session.userId, approved_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return fail("TRIP_APPROVE_FAILED", error.message, 500);
    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
