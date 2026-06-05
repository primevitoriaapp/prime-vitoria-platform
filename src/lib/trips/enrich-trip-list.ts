import { db } from "@/lib/server/db";
import { enrichTripItemsWithVehicles } from "@/lib/trips/enrich-trip-vehicles";

export type TripListItemMeta = {
  client_name: string | null;
  driver_name: string | null;
};

export async function enrichTripListItems<
  T extends { client_id: string; driver_id?: string | null; vehicle_id?: string | null }
>(items: T[]): Promise<(T & TripListItemMeta & { vehicle?: { id: string; model: string; plate: string } | null })[]> {
  if (!items.length) return [];

  const clientIds = [...new Set(items.map((t) => t.client_id))];
  const driverIds = [
    ...new Set(items.map((t) => t.driver_id).filter((id): id is string => Boolean(id)))
  ];

  const [{ data: clients }, { data: drivers }] = await Promise.all([
    db.from("clients").select("id, name").in("id", clientIds),
    driverIds.length
      ? db.from("drivers").select("id, full_name, profile_name").in("id", driverIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; profile_name: string | null }[] })
  ]);

  const clientById = new Map((clients ?? []).map((c) => [c.id, c.name as string]));
  const driverById = new Map(
    (drivers ?? []).map((d) => [
      d.id,
      (d.full_name as string | null)?.trim() ||
        (d.profile_name as string | null)?.trim() ||
        null
    ])
  );

  const withVehicles = await enrichTripItemsWithVehicles(items);

  return withVehicles.map((trip) => ({
    ...trip,
    client_name: clientById.get(trip.client_id) ?? null,
    driver_name: trip.driver_id ? (driverById.get(trip.driver_id) ?? null) : null
  }));
}
