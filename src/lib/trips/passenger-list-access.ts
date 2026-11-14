import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

export type PassengerListTrip = {
  id: string;
  tenant_id: string;
  client_id: string;
  driver_id: string | null;
  operational_status: string;
  passenger_name: string | null;
  destination_text: string | null;
  trip_dropoff_stops: unknown;
  boarded_passengers: unknown;
};

/** Motorista da própria corrida, ou admin/operador do tenant. */
export async function loadTripForPassengerList(tripId: string): Promise<
  { ok: true; trip: PassengerListTrip; role: string; tenantId: string } | { ok: false; status: number; message: string }
> {
  const session = await withResolvedDriverId(await getSessionContext());
  if (!["motorista", "admin", "operador"].includes(session.role)) return { ok: false, status: 403, message: "Sem permissão." };
  const tenantId = assertTenantScope(session);
  const { data } = await db
    .from("trips")
    .select("id, tenant_id, client_id, driver_id, operational_status, passenger_name, destination_text, trip_dropoff_stops, boarded_passengers")
    .eq("id", tripId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const trip = data as PassengerListTrip | null;
  if (!trip) return { ok: false, status: 404, message: "Corrida não encontrada." };
  if (session.role === "motorista" && (!session.driverId || trip.driver_id !== session.driverId)) {
    return { ok: false, status: 403, message: "Corrida de outro motorista." };
  }
  return { ok: true, trip, role: session.role, tenantId };
}
