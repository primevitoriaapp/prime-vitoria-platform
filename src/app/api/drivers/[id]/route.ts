import { z } from "zod";
import { db } from "@/lib/server/db";
import { driverCadastroSchema, normalizeDriverBody } from "@/lib/drivers/driver-cadastro-schema";
import { canonicalDriverPatchRow, driverRowToApiShape } from "@/lib/drivers/driver-supabase-row";
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
      ...driverRowToApiShape(withProfile as Record<string, unknown>),
      profile_phone: profilePhone,
      phone: driver.phone ?? profilePhone ?? null,
      photo_url,
      default_vehicle,
      linked_vehicles,
      has_pin: Boolean((driver as { pin_hash?: string | null }).pin_hash)
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
    const rawBody = await request.json();
    console.log("[drivers PATCH] body recebido", { driverId: id, tenantId, body: rawBody });

    const parsed = patchSchema.parse(rawBody);
    const { profile_name, profile_phone, cpf, ...driverFields } = parsed;

    const normalized = normalizeDriverBody(driverFields) as Record<string, unknown>;
    if (cpf !== undefined) normalized.cpf = cpf.trim();
    if (profile_name !== undefined) normalized.full_name = profile_name.trim();
    if (profile_phone !== undefined) {
      const t = profile_phone?.trim();
      normalized.phone = t ? t : null;
    }

    const updateRow = canonicalDriverPatchRow(normalized);
    console.log("[drivers PATCH] updateRow Supabase", { driverId: id, updateRow });

    if (
      Object.keys(updateRow).length === 0 &&
      profile_name === undefined &&
      profile_phone === undefined
    ) {
      return fail("INVALID_BODY", "Nenhum campo para actualizar", 400);
    }

    const { data: existing, error: loadErr } = await db
      .from("drivers")
      .select("id, profile_id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadErr) {
      console.log("[drivers PATCH] erro Supabase (load)", loadErr);
      return fail("DRIVER_LOAD_FAILED", loadErr.message, 500, loadErr.hint ?? loadErr.details ?? undefined);
    }
    if (!existing) return fail("DRIVER_NOT_FOUND", "Motorista não encontrado", 404);

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
        console.log("[drivers PATCH] erro Supabase (profile)", profileErr);
        return fail("PROFILE_UPDATE_FAILED", profileErr.message, 500, profileErr.hint ?? profileErr.details ?? undefined);
      }
    }

    const { data, error } = await db
      .from("drivers")
      .update(updateRow)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) {
      console.log("[drivers PATCH] erro Supabase (drivers.update)", error);
      const hint = [error.hint, error.details, error.code].filter(Boolean).join(" — ");
      return fail("DRIVER_UPDATE_FAILED", error.message, 500, hint || undefined);
    }

    const row = driverRowToApiShape({ ...data, id: existing.id, profile_id: existing.profile_id } as Record<
      string,
      unknown
    >);
    const [enriched] = await attachDefaultVehiclesToDrivers(
      await attachProfileNamesToDrivers([row as typeof data])
    );

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: parsed.active === false ? "driver.deactivate" : "driver.update",
      entityType: "driver",
      entityId: id,
      metadata: { profile_id: existing.profile_id },
      request
    });

    return ok(driverRowToApiShape(enriched as Record<string, unknown>));
  } catch (error) {
    console.log("[drivers PATCH] excepção", error);
    return mapApiError(error);
  }
}
