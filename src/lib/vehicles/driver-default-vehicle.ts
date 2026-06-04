import { db } from "@/lib/server/db";

export type VehicleSummary = {
  id: string;
  model: string;
  plate: string;
  brand?: string | null;
  category?: string | null;
  is_default?: boolean;
};

export type LinkedVehicle = VehicleSummary & { link_id: string };

async function fetchDefaultLink(driverId: string) {
  const { data: defaultLink } = await db
    .from("driver_vehicle_links")
    .select("vehicle_id, id")
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (defaultLink?.vehicle_id) return defaultLink;

  const { data: fallback } = await db
    .from("driver_vehicle_links")
    .select("vehicle_id, id")
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback;
}

export async function resolveDefaultVehicleForDriver(driverId: string): Promise<VehicleSummary | null> {
  const link = await fetchDefaultLink(driverId);
  if (!link?.vehicle_id) return null;

  const { data: vehicle } = await db
    .from("vehicles")
    .select("id, model, plate, brand, category")
    .eq("id", link.vehicle_id)
    .eq("active", true)
    .maybeSingle();

  return vehicle ? { ...vehicle, is_default: true } : null;
}

export async function listLinkedVehiclesForDriver(driverId: string): Promise<LinkedVehicle[]> {
  const { data: links } = await db
    .from("driver_vehicle_links")
    .select("id, vehicle_id, is_default")
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null)
    .order("is_default", { ascending: false })
    .order("start_at", { ascending: false });

  if (!links?.length) return [];

  const vehicleIds = links.map((l) => l.vehicle_id);
  const { data: vehicles } = await db
    .from("vehicles")
    .select("id, model, plate, brand, category, active")
    .in("id", vehicleIds);

  const byId = new Map((vehicles ?? []).map((v) => [v.id, v]));

  const out: LinkedVehicle[] = [];
  for (const link of links) {
    const v = byId.get(link.vehicle_id);
    if (!v || !v.active) continue;
    out.push({
      link_id: link.id,
      id: v.id,
      model: v.model,
      plate: v.plate,
      brand: v.brand,
      category: v.category,
      is_default: Boolean(link.is_default)
    });
  }
  return out;
}

export async function attachProfileNamesToDrivers<
  T extends { profile_id?: string | null; full_name?: string | null }
>(drivers: T[]): Promise<Array<T & { profile_name: string | null }>> {
  if (!drivers.length) return [];

  const profileIds = drivers.map((d) => d.profile_id).filter((id): id is string => Boolean(id));
  const byId = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await db.from("profiles").select("id, name").in("id", profileIds);
    for (const p of profiles ?? []) {
      byId.set(p.id, p.name);
    }
  }

  return drivers.map((driver) => ({
    ...driver,
    profile_name:
      (driver.full_name as string | null | undefined)?.trim() ||
      (driver.profile_id ? byId.get(driver.profile_id) : null) ||
      null
  }));
}

export async function attachDefaultVehiclesToDrivers<T extends { id: string }>(
  drivers: T[]
): Promise<Array<T & { default_vehicle: VehicleSummary | null; linked_vehicles: LinkedVehicle[] }>> {
  if (!drivers.length) return [];

  const enriched = await Promise.all(
    drivers.map(async (driver) => {
      const linked_vehicles = await listLinkedVehiclesForDriver(driver.id);
      const default_vehicle = linked_vehicles.find((v) => v.is_default) ?? linked_vehicles[0] ?? null;
      return { ...driver, default_vehicle, linked_vehicles };
    })
  );

  return enriched;
}

export async function linkVehicleToDriver(opts: {
  tenantId: string;
  driverId: string;
  vehicleId: string;
  setDefault?: boolean;
}): Promise<void> {
  const { tenantId, driverId, vehicleId, setDefault = false } = opts;

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

  const { data: existing } = await db
    .from("driver_vehicle_links")
    .select("id, active, end_at")
    .eq("driver_id", driverId)
    .eq("vehicle_id", vehicleId)
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let linkId = existing?.id;

  if (existing && (!existing.active || existing.end_at)) {
    await db
      .from("driver_vehicle_links")
      .update({ active: true, end_at: null })
      .eq("id", existing.id);
  } else if (!existing) {
    const { data: inserted, error: insertErr } = await db
      .from("driver_vehicle_links")
      .insert({ driver_id: driverId, vehicle_id: vehicleId, active: true })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);
    linkId = inserted.id;
  }

  if (setDefault && linkId) {
    await markDefaultVehicleLink(driverId, linkId);
  } else {
    const { count } = await db
      .from("driver_vehicle_links")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driverId)
      .eq("active", true)
      .is("end_at", null);
    if (count === 1 && linkId) {
      await markDefaultVehicleLink(driverId, linkId);
    }
  }
}

async function markDefaultVehicleLink(driverId: string, linkId: string) {
  await db
    .from("driver_vehicle_links")
    .update({ is_default: false })
    .eq("driver_id", driverId)
    .eq("active", true)
    .is("end_at", null);

  await db.from("driver_vehicle_links").update({ is_default: true }).eq("id", linkId);
}

export async function setDefaultVehicleForDriver(opts: {
  tenantId: string;
  driverId: string;
  vehicleId: string;
}): Promise<void> {
  await linkVehicleToDriver({ ...opts, setDefault: true });
}

export async function unlinkVehicleFromDriver(opts: {
  tenantId: string;
  driverId: string;
  vehicleId: string;
}): Promise<void> {
  const { tenantId, driverId, vehicleId } = opts;
  const { data: driver } = await db
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!driver) throw new Error("Motorista nao encontrado");

  const now = new Date().toISOString();
  await db
    .from("driver_vehicle_links")
    .update({ active: false, end_at: now, is_default: false })
    .eq("driver_id", driverId)
    .eq("vehicle_id", vehicleId)
    .eq("active", true)
    .is("end_at", null);
}
