import { db } from "@/lib/server/db";
import type { VehicleSummary } from "@/lib/vehicles/driver-default-vehicle";

export type TripWithVehicle<T> = T & { vehicle?: VehicleSummary | null };

export async function enrichTripItemsWithVehicles<T extends { vehicle_id?: string | null }>(
  items: T[]
): Promise<TripWithVehicle<T>[]> {
  const vehicleIds = [...new Set(items.map((t) => t.vehicle_id).filter((id): id is string => Boolean(id)))];
  if (!vehicleIds.length) {
    return items.map((trip) => ({ ...trip, vehicle: null }));
  }

  const { data: vehicles } = await db.from("vehicles").select("id, model, plate").in("id", vehicleIds);
  const byId = new Map((vehicles ?? []).map((v) => [v.id, v]));

  return items.map((trip) => ({
    ...trip,
    vehicle: trip.vehicle_id ? (byId.get(trip.vehicle_id) ?? null) : null
  }));
}
