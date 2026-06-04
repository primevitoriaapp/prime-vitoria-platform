import { z } from "zod";
import { db } from "@/lib/server/db";
import { updateDriverRow } from "@/lib/drivers/driver-db";
import { driverCadastroSchema, normalizeDriverBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { mapSupabaseError } from "@/lib/server/supabase-errors";
import {
  attachDefaultVehiclesToDrivers,
  attachProfileNamesToDrivers,
  listLinkedVehiclesForDriver
} from "@/lib/vehicles/driver-default-vehicle";
import { resolveDriverPhotoDisplayUrl } from "@/lib/storage/driver-photo-upload";

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
    if (error) {
      const mapped = mapSupabaseError(error, "motorista");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }
    if (!driver) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

    const [withProfile] = await attachProfileNamesToDrivers([driver]);
    const linked_vehicles = await listLinkedVehiclesForDriver(id);
    const default_vehicle = linked_vehicles.find((v) => v.is_default) ?? linked_vehicles[0] ?? null;

    let profilePhone: string | null = null;
    if (driver.profile_id) {
      const { data: profile } = await db
        .from("profiles")
        .select("phone")
        .eq("id", driver.profile_id)
        .maybeSingle();
      profilePhone = profile?.phone ?? null;
    }

    const photo_url = await resolveDriverPhotoDisplayUrl(driver.photo_url as string | null);

    return ok({
      ...withProfile,
      profile_phone: profilePhone,
      phone: driver.phone ?? profilePhone ?? null,
      photo_url,
      default_vehicle,
      linked_vehicles
    });
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

    if (profile_phone !== undefined) {
      const t = profile_phone?.trim();
      updatePayload.phone = t ? t : null;
    }

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
    if (!existing) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

    if (profile_name !== undefined) {
      updatePayload.full_name = profile_name.trim();
    }

    if (existing.profile_id && (profile_name !== undefined || profile_phone !== undefined)) {
      const profileUpdate: Record<string, string | null> = {};
      if (profile_name !== undefined) profileUpdate.name = profile_name.trim();
      if (profile_phone !== undefined) {
        const t = profile_phone?.trim();
        profileUpdate.phone = t ? t : null;
      }
      const { error: profileErr } = await db
        .from("profiles")
        .update(profileUpdate)
        .eq("id", existing.profile_id);
      if (profileErr) {
        return fail("PROFILE_UPDATE_FAILED", profileErr.message, 500);
      }
    }

    let row: { id: string; profile_id?: string | null } & Record<string, unknown> = existing;
    let partialSave = false;

    if (Object.keys(updatePayload).length > 0) {
      const result = await updateDriverRow(id, tenantId, updatePayload);
      if (result.error || !result.data) {
        const mapped = mapSupabaseError(result.error!, "motorista");
        return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
      }
      row = { ...result.data, id: existing.id, profile_id: existing.profile_id };
      partialSave = result.partialSave ?? false;
    } else {
      const { data: refreshed } = await db.from("drivers").select("*").eq("id", id).single();
      if (refreshed) row = { ...refreshed, id: existing.id, profile_id: existing.profile_id };
    }

    const [enriched] = await attachDefaultVehiclesToDrivers(await attachProfileNamesToDrivers([row]));

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: parsed.active === false ? "driver.deactivate" : "driver.update",
      entityType: "driver",
      entityId: id,
      metadata: { profile_id: existing.profile_id, partialSave },
      request
    });

    const warning = partialSave
      ? "Dados guardados parcialmente — aplique migrations 0044, 0045 e 0047 no Supabase de staging."
      : undefined;

    return ok({ ...enriched, ...(warning ? { _warning: warning } : {}) });
  } catch (error) {
    return mapApiError(error);
  }
}
