import { db } from "@/lib/server/db";

export type VehicleSummary = { id: string; model: string; plate: string };

export async function resolveDefaultVehicleForDriver(driverId: string): Promise<VehicleSummary | null> {
  const { data: link } = await db
    .from("driver_vehicle_links")
    .select("vehicle_id")
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!link?.vehicle_id) return null;

  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, model, plate")
    .eq("id", link.vehicle_id)
    .eq("active", true)
    .maybeSingle();

  return vehicle ?? null;
}

export async function attachProfileNamesToDrivers<T extends { profile_id: string }>(
  drivers: T[]
): Promise<Array<T & { profile_name: string | null }>> {
  if (!drivers.length) return [];

  const profileIds = drivers.map((d) => d.profile_id);
  const { data: profiles } = await db.from("profiles").select("id, name").in("id", profileIds);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  return drivers.map((driver) => ({
    ...driver,
    profile_name: byId.get(driver.profile_id) ?? null
  }));
}

export async function attachDefaultVehiclesToDrivers<T extends { id: string }>(
  drivers: T[]
): Promise<Array<T & { default_vehicle: VehicleSummary | null }>> {
  if (!drivers.length) return [];

  const driverIds = drivers.map((d) => d.id);
  const { data: links } = await db
    .from("driver_vehicle_links")
    .select("driver_id, vehicle_id")
    .in("driver_id", driverIds)
    .eq("active", true)
    .is("end_at", null);

  const vehicleIds = [...new Set((links ?? []).map((l) => l.vehicle_id))];
  const vehicleById = new Map<string, VehicleSummary>();

  if (vehicleIds.length) {
    const { data: vehicles } = await db
      .from("vehicles")
      .select("id, model, plate")
      .in("id", vehicleIds)
      .eq("active", true);
    for (const v of vehicles ?? []) {
      vehicleById.set(v.id, v);
    }
  }

  const linkByDriver = new Map<string, string>();
  for (const link of links ?? []) {
    if (!linkByDriver.has(link.driver_id)) {
      linkByDriver.set(link.driver_id, link.vehicle_id);
    }
  }

  return drivers.map((driver) => {
    const vehicleId = linkByDriver.get(driver.id);
    const default_vehicle = vehicleId ? (vehicleById.get(vehicleId) ?? null) : null;
    return { ...driver, default_vehicle };
  });
}

export async function setDefaultVehicleForDriver(opts: {
  tenantId: string;
  driverId: string;
  vehicleId: string;
}): Promise<void> {
  const { tenantId, driverId, vehicleId } = opts;

  const { data: driver, error: driverErr } = await db
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (driverErr || !driver) {
    throw new Error("Motorista nao encontrado");
  }

  const { data: vehicle, error: vehicleErr } = await db
    .from("vehicles")
    .select("id")
    .eq("id", vehicleId)
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .maybeSingle();
  if (vehicleErr || !vehicle) {
    throw new Error("Veiculo nao encontrado ou inactivo");
  }

  const now = new Date().toISOString();
  await db
    .from("driver_vehicle_links")
    .update({ active: false, end_at: now })
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null);

  const { error: insertErr } = await db.from("driver_vehicle_links").insert({
    driver_id: driverId,
    vehicle_id: vehicleId,
    active: true
  });
  if (insertErr) {
    throw new Error(insertErr.message);
  }
}
