import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { buildClientScheduleMessage, type ScheduleTrip } from "@/lib/messages/client-schedule-message";
import { whatsappLink } from "@/lib/messages/templates";
import { parseTripPickupStops } from "@/lib/trips/trip-pickup-stops";

const SKIP = ["cancelled", "rejected", "no_show"];

/** Mensagem pronta com as corridas do cliente entre duas datas (YYYY-MM-DD, horário de Brasília). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.read");
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? from;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return fail("INVALID_DATE", "Datas inválidas", 400);

    const { data: client } = await db
      .from("clients")
      .select("id, name, trade_name, whatsapp, phone")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);

    const fromIso = new Date(`${from}T00:00:00-03:00`).toISOString();
    const toIso = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + 86400000).toISOString();
    const { data: rows, error } = await db
      .from("trips")
      .select("id, scheduled_at, passenger_name, passenger_count, origin_text, destination_text, flight_number, driver_id, vehicle_id, operational_status, trip_pickup_stops")
      .eq("tenant_id", tenantId)
      .eq("client_id", id)
      .gte("scheduled_at", fromIso)
      .lt("scheduled_at", toIso)
      .order("scheduled_at")
      .limit(100);
    if (error) return fail("TRIPS_FAILED", error.message, 500);
    const trips = (rows ?? []).filter((t) => !SKIP.includes(t.operational_status as string));

    const driverIds = [...new Set(trips.map((t) => t.driver_id as string | null).filter((x): x is string => Boolean(x)))];
    const [{ data: drivers }, { data: links }] = await Promise.all([
      driverIds.length ? db.from("drivers").select("id, full_name, phone, whatsapp").in("id", driverIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; phone: string | null; whatsapp: string | null }[] }),
      driverIds.length
        ? db.from("driver_vehicle_links").select("driver_id, vehicle_id, is_default").in("driver_id", driverIds).eq("active", true)
        : Promise.resolve({ data: [] as { driver_id: string; vehicle_id: string; is_default: boolean | null }[] })
    ]);
    // Carro da corrida; se não tiver, o carro padrão do motorista.
    const defaultVehicle = new Map<string, string>();
    for (const l of links ?? []) if (l.is_default || !defaultVehicle.has(l.driver_id as string)) defaultVehicle.set(l.driver_id as string, l.vehicle_id as string);
    const vehicleIds = [
      ...new Set(
        trips
          .map((t) => (t.vehicle_id as string | null) ?? (t.driver_id ? defaultVehicle.get(t.driver_id as string) : undefined))
          .filter((x): x is string => Boolean(x))
      )
    ];
    const { data: vehicles } = vehicleIds.length
      ? await db.from("vehicles").select("id, brand, model, color, plate").in("id", vehicleIds)
      : { data: [] as { id: string; brand: string | null; model: string; color: string | null; plate: string }[] };
    const driverName = new Map((drivers ?? []).map((d) => [d.id as string, (d.full_name as string | null) ?? null]));
    const driverPhone = new Map((drivers ?? []).map((d) => [d.id as string, ((d.whatsapp as string | null) || (d.phone as string | null)) ?? null]));
    const vehicleById = new Map((vehicles ?? []).map((v) => [v.id as string, v]));

    const list: ScheduleTrip[] = trips.map((t) => {
      const vid = (t.vehicle_id as string | null) ?? (t.driver_id ? defaultVehicle.get(t.driver_id as string) : undefined);
      const v = vid ? vehicleById.get(vid) : undefined;
      const stops = parseTripPickupStops(t.trip_pickup_stops).slice(1).map((s) => s.pickup_text);
      return {
        scheduled_at: t.scheduled_at as string,
        passenger_name: (t.passenger_name as string | null) ?? null,
        passenger_count: (t.passenger_count as number | null) ?? null,
        origin_text: (t.origin_text as string | null) ?? null,
        destination_text: (t.destination_text as string | null) ?? null,
        flight_number: (t.flight_number as string | null) ?? null,
        driver_name: t.driver_id ? (driverName.get(t.driver_id as string) ?? null) : null,
        driver_phone: t.driver_id ? (driverPhone.get(t.driver_id as string) ?? null) : null,
        vehicle: v ? { brand: v.brand, model: v.model, color: v.color, plate: v.plate } : null,
        stops
      };
    });

    const clientName = ((client.trade_name as string | null) || (client.name as string)).trim();
    const text = list.length ? buildClientScheduleMessage({ clientName, trips: list }) : "";
    const phone = (client.whatsapp as string | null) || (client.phone as string | null);
    return ok({
      client_name: clientName,
      count: list.length,
      without_driver: list.filter((t) => !t.driver_name).length,
      text,
      phone: phone ?? null,
      whatsapp_url: text ? whatsappLink(phone, text) : null
    });
  } catch (error) {
    return mapApiError(error);
  }
}
