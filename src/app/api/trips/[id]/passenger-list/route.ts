import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { loadTripForPassengerList } from "@/lib/trips/passenger-list-access";
import { dropoffStopSchema, parseDropoffStops, passengerSummary } from "@/lib/trips/trip-dropoff-stops";

const CLOSED = ["completed", "cancelled", "rejected", "no_show"];

/** Lista de funcionários da empresa (para marcar quem embarcou) + a lista já salva da corrida. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    const { data: client } = await db.from("clients").select("requires_passenger_list").eq("id", r.trip.client_id).maybeSingle();
    const required = client?.requires_passenger_list === true;
    const { data: roster } = await db
      .from("client_passengers")
      .select("id, name, address")
      .eq("client_id", r.trip.client_id)
      .eq("active", true)
      .order("name")
      .limit(500);
    return ok({
      required,
      roster: (roster ?? []).map((p) => ({ id: p.id as string, name: p.name as string, address: (p.address as string | null) ?? null })),
      stops: parseDropoffStops(r.trip.trip_dropoff_stops),
      default_destination: r.trip.destination_text
    });
  } catch (e) {
    return mapApiError(e);
  }
}

const bodySchema = z.object({ passengers: z.array(dropoffStopSchema.omit({ dropped_at: true })).min(1).max(30) });

/** Salva quem embarcou: cada passageiro vira uma parada de desembarque, na ordem enviada. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForPassengerList(id);
    if (!r.ok) return fail("FORBIDDEN", r.message, r.status);
    if (CLOSED.includes(r.trip.operational_status)) return fail("TRIP_CLOSED", "Corrida já encerrada.", 409);
    const body = bodySchema.parse(await request.json());
    const previous = parseDropoffStops(r.trip.trip_dropoff_stops);
    const stops = body.passengers.map((p) => {
      const was = previous.find((s) => (p.passenger_id && s.passenger_id === p.passenger_id) || s.passenger_name === p.passenger_name);
      return { ...p, passenger_id: p.passenger_id ?? null, lat: p.lat ?? null, lng: p.lng ?? null, dropped_at: was?.dropped_at ?? null };
    });
    const { error } = await db
      .from("trips")
      .update({ trip_dropoff_stops: stops, passenger_count: stops.length, passenger_name: passengerSummary(stops) })
      .eq("id", id)
      .eq("tenant_id", r.tenantId);
    if (error) return fail("SAVE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId: r.tenantId,
      actorUserId: null,
      action: "trip.passenger_list",
      entityType: "trip",
      entityId: id,
      metadata: { by: r.role, passengers: stops.map((s) => s.passenger_name) }
    }).catch(() => undefined);
    return ok({ stops });
  } catch (e) {
    return mapApiError(e);
  }
}
