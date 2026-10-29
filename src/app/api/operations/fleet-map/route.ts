import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { fleetStatus } from "@/lib/drivers/fleet-status";

/** Mapa da central: motoristas, última posição, situação (cor) e próxima corrida. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem acesso", 403);
    const tenantId = assertTenantScope(session);
    const nowIso = new Date().toISOString();
    const in12h = new Date(Date.now() + 12 * 3600_000).toISOString();

    const [{ data: drivers }, { data: locs }, { data: trips }] = await Promise.all([
      db
        .from("drivers")
        .select("id, full_name, phone, whatsapp, operational_status, operational_status_updated_at, active")
        .eq("tenant_id", tenantId)
        .neq("active", false)
        .limit(300),
      db
        .from("driver_locations")
        .select("driver_id, lat, lng, recorded_at")
        .eq("tenant_id", tenantId)
        .gte("recorded_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .order("recorded_at", { ascending: false })
        .limit(2000),
      db
        .from("trips")
        .select("id, driver_id, scheduled_at, operational_status, passenger_name, origin_text, origin_lat, origin_lng, vehicle_id")
        .eq("tenant_id", tenantId)
        .not("driver_id", "is", null)
        .in("operational_status", ["dispatched", "accepted", "on_the_way", "arrived", "in_progress", "approved"])
        .gte("scheduled_at", new Date(Date.now() - 6 * 3600_000).toISOString())
        .lte("scheduled_at", in12h)
        .order("scheduled_at", { ascending: true })
        .limit(500)
    ]);

    const lastLoc = new Map<string, { lat: number; lng: number; recorded_at: string }>();
    for (const l of locs ?? []) {
      if (!lastLoc.has(l.driver_id as string)) {
        lastLoc.set(l.driver_id as string, { lat: Number(l.lat), lng: Number(l.lng), recorded_at: l.recorded_at as string });
      }
    }
    const nextTrip = new Map<string, Record<string, unknown>>();
    for (const t of (trips ?? []) as Record<string, unknown>[]) {
      const d = t.driver_id as string;
      const current = nextTrip.get(d);
      const active = ["on_the_way", "arrived", "in_progress"].includes(t.operational_status as string);
      if (!current || (active && !["on_the_way", "arrived", "in_progress"].includes(current.operational_status as string))) {
        if (!current || active || (t.scheduled_at as string) >= nowIso) nextTrip.set(d, t);
      }
    }

    const vehicleIds = [...new Set([...nextTrip.values()].map((t) => t.vehicle_id as string).filter(Boolean))];
    const vehicles = new Map<string, { model: string | null; plate: string | null }>();
    if (vehicleIds.length) {
      const { data: vs } = await db.from("vehicles").select("id, model, plate").in("id", vehicleIds);
      for (const v of vs ?? []) vehicles.set(v.id as string, { model: (v.model as string) ?? null, plate: (v.plate as string) ?? null });
    }

    const items = (drivers ?? []).map((d) => {
      const loc = lastLoc.get(d.id as string) ?? null;
      const trip = nextTrip.get(d.id as string) ?? null;
      return {
        id: d.id,
        name: d.full_name,
        phone: d.whatsapp || d.phone || null,
        status: fleetStatus(d.operational_status as string | null, trip?.scheduled_at as string | null),
        location: loc,
        next_trip: trip
          ? {
              id: trip.id,
              scheduled_at: trip.scheduled_at,
              passenger: trip.passenger_name,
              origin: trip.origin_text,
              origin_lat: trip.origin_lat == null ? null : Number(trip.origin_lat),
              origin_lng: trip.origin_lng == null ? null : Number(trip.origin_lng),
              status: trip.operational_status,
              vehicle: trip.vehicle_id ? (vehicles.get(trip.vehicle_id as string) ?? null) : null
            }
          : null
      };
    });
    return ok({ items, generated_at: nowIso });
  } catch (error) {
    return mapApiError(error);
  }
}
