import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import {
  markPickupStopCompleted,
  parseTripPickupStops,
  tripPickupStopsSchema
} from "@/lib/trips/trip-pickup-stops";

const bodySchema = z.object({
  stop_index: z.coerce.number().int().min(0)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    assertCapability(session, "trip.status");

    if (session.role !== "motorista") {
      return fail("FORBIDDEN", "Apenas motorista pode marcar paradas concluídas", 403);
    }
    if (!session.driverId) {
      return fail("FORBIDDEN", "Motorista precisa de cadastro vinculado a sessao", 403);
    }

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(
        session,
        {
          client_id: trip.client_id,
          driver_id: trip.driver_id ?? null,
          tenant_id: trip.tenant_id
        },
        session.driverId
      )
    );
    if (denied) return denied;

    if (trip.driver_id !== session.driverId) {
      return fail("FORBIDDEN", "Motorista so pode actualizar as proprias corridas", 403);
    }

    const stops = parseTripPickupStops(trip.trip_pickup_stops);
    if (stops.length < 2) {
      return fail("NO_PICKUP_STOPS", "Corrida sem paradas múltiplas", 400);
    }

    const updated = markPickupStopCompleted(stops, body.stop_index);
    if (updated === stops) {
      return fail("INVALID_STOP_INDEX", "Parada inválida ou fora de ordem", 409);
    }

    const validated = tripPickupStopsSchema.parse(updated);

    const { data, error } = await db
      .from("trips")
      .update({ trip_pickup_stops: validated })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("PICKUP_STOP_UPDATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.pickup_stop_complete",
      entityType: "trip",
      entityId: id,
      metadata: { stop_index: body.stop_index, passenger_name: validated[body.stop_index]?.passenger_name },
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
