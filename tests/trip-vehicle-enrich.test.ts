import test from "node:test";
import assert from "node:assert/strict";

function mapTripsWithVehicles<T extends { vehicle_id?: string | null }>(
  items: T[],
  vehicles: { id: string; model: string; plate: string }[]
) {
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  return items.map((trip) => ({
    ...trip,
    vehicle: trip.vehicle_id ? (byId.get(trip.vehicle_id) ?? null) : null
  }));
}

test("mapTripsWithVehicles attaches plate when vehicle_id present", () => {
  const items = [{ id: "t1", vehicle_id: "v1" }, { id: "t2", vehicle_id: null }];
  const out = mapTripsWithVehicles(items, [{ id: "v1", model: "Corolla", plate: "ABC1D23" }]);
  assert.equal(out[0].vehicle?.plate, "ABC1D23");
  assert.equal(out[1].vehicle, null);
});
