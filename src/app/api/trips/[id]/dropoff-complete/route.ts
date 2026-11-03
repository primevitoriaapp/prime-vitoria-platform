import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadTripForPassengerList } from "@/lib/trips/passenger-list-access";
import { markDropoff, parseDropoffStops } from "@/lib/trips/trip-dropoff-stops";

const bodySchema = z.object({ index: z.coerce.number().int().min(0) });

/** Motorista marca que o passageiro desceu na parada dele. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    if (r.trip.operational_status !== "in_progress") return fail("NOT_IN_PROGRESS", "A viagem precisa estar em andamento.", 409);
    const { index } = bodySchema.parse(await request.json());
    const stops = parseDropoffStops(r.trip.trip_dropoff_stops);
    const next = markDropoff(stops, index);
    if (next === stops) return fail("INVALID_STOP", "Parada inválida ou já marcada.", 409);
    const { error } = await db.from("trips").update({ trip_dropoff_stops: next }).eq("id", id).eq("tenant_id", r.tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    return ok({ stops: next });
  } catch (e) {
    return mapApiError(e);
  }
}
