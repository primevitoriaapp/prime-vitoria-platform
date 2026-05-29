import { z } from "zod";
import { db } from "@/lib/server/db";
import { driverCadastroSchema, normalizeDriverBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import {
  attachDefaultVehiclesToDrivers,
  attachProfileNamesToDrivers,
  listLinkedVehiclesForDriver
} from "@/lib/vehicles/driver-default-vehicle";

const patchSchema = driverCadastroSchema
  .omit({ profile_id: true })
  .partial()
  .extend({ cpf: z.string().min(11).optional() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: driver, error } = await db
      .from("drivers")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return fail("DRIVER_GET_FAILED", error.message, 500);
    if (!driver) return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);

    const [withProfile] = await attachProfileNamesToDrivers([driver]);
    const linked_vehicles = await listLinkedVehiclesForDriver(id);
    const default_vehicle = linked_vehicles.find((v) => v.is_default) ?? linked_vehicles[0] ?? null;

    const { data: profile } = await db
      .from("profiles")
      .select("phone")
      .eq("id", driver.profile_id)
      .maybeSingle();

    return ok({ ...withProfile, profile_phone: profile?.phone ?? null, default_vehicle, linked_vehicles });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const parsed = patchSchema.parse(await request.json());
    const { profile_name, profile_phone, cpf, ...driverFields } = parsed;
    const updatePayload = normalizeDriverBody(driverFields);
    if (cpf !== undefined) updatePayload.cpf = cpf.trim();

    if (
      Object.keys(updatePayload).length === 0 &&
      profile_name === undefined &&
      profile_phone === undefined
    ) {
      return fail("INVALID_BODY", "Nenhum campo para actualizar", 400);
    }

    const { data: existing } = await db
      .from("drivers")
      .select("id, profile_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);

    if (profile_name !== undefined || profile_phone !== undefined) {
      const profileUpdate: Record<string, string | null> = {};
      if (profile_name !== undefined) profileUpdate.name = profile_name.trim();
      if (profile_phone !== undefined) {
        const t = profile_phone?.trim();
        profileUpdate.phone = t ? t : null;
      }
      await db.from("profiles").update(profileUpdate).eq("id", existing.profile_id);
    }

    let row = existing;
    if (Object.keys(updatePayload).length > 0) {
      const { data: updated, error } = await db
        .from("drivers")
        .update(updatePayload)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select("*")
        .single();
      if (error) return fail("DRIVER_UPDATE_FAILED", error.message, 500);
      row = updated;
    } else {
      const { data: refreshed } = await db.from("drivers").select("*").eq("id", id).single();
      if (refreshed) row = refreshed;
    }

    const [enriched] = await attachDefaultVehiclesToDrivers(await attachProfileNamesToDrivers([row]));

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: parsed.active === false ? "driver.deactivate" : "driver.update",
      entityType: "driver",
      entityId: id,
      metadata: { profile_id: existing.profile_id },
      request
    });

    return ok(enriched);
  } catch (error) {
    return mapApiError(error);
  }
}
