import { db } from "@/lib/server/db";
import { insertDriverRow } from "@/lib/drivers/driver-db";
import { driverCreateSchema, normalizeDriverBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import { mapSupabaseError } from "@/lib/server/supabase-errors";
import {
  attachDefaultVehiclesToDrivers,
  attachProfileNamesToDrivers
} from "@/lib/vehicles/driver-default-vehicle";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const parsed = driverCreateSchema.parse(await request.json());
    const { profile_name, profile_phone, ...rest } = parsed;
    const body = normalizeDriverBody(rest);
    const insertRow = { ...body, profile_id: parsed.profile_id, cpf: parsed.cpf.trim() };

    const { data: prof, error: pe } = await db
      .from("profiles")
      .select("tenant_id")
      .eq("id", parsed.profile_id)
      .maybeSingle();
    if (pe || !prof || prof.tenant_id !== tenantId) {
      return fail("FORBIDDEN", "Perfil inválido ou de outra organização", 403);
    }

    const { data, error, partialSave } = await insertDriverRow(insertRow, tenantId);

    if (error || !data) {
      if (error && isPostgresUniqueViolation(error)) {
        return fail("DRIVER_PROFILE_CONFLICT", "Já existe motorista vinculado a este perfil", 409);
      }
      const mapped = mapSupabaseError(error!, "motorista");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.create",
      entityType: "driver",
      entityId: String(data.id),
      metadata: { profile_id: parsed.profile_id, partialSave: partialSave ?? false },
      request
    });

    if (profile_name !== undefined || profile_phone !== undefined) {
      const profileUpdate: Record<string, string | null> = {};
      if (profile_name !== undefined) profileUpdate.name = profile_name.trim();
      if (profile_phone !== undefined) {
        const t = profile_phone?.trim();
        profileUpdate.phone = t ? t : null;
      }
      await db.from("profiles").update(profileUpdate).eq("id", parsed.profile_id);
    }

    const driverRow = {
      ...data,
      id: String(data.id),
      profile_id: parsed.profile_id
    };
    const [enriched] = await attachDefaultVehiclesToDrivers(await attachProfileNamesToDrivers([driverRow]));
    const warning = partialSave
      ? "Motorista criado com dados básicos. Complete a ficha após migration 0044."
      : undefined;

    return ok({ ...enriched, ...(warning ? { _warning: warning } : {}) }, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const includeInactive = new URL(request.url).searchParams.get("include_inactive") === "1";

    let query = db.from("drivers").select("*").eq("tenant_id", tenantId).limit(200);
    if (!includeInactive) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;
    if (error) {
      const mapped = mapSupabaseError(error, "listagem de motoristas");
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }
    const withProfiles = await attachProfileNamesToDrivers(data ?? []);
    const withVehicles = await attachDefaultVehiclesToDrivers(withProfiles);
    return ok(withVehicles);
  } catch (error) {
    return mapApiError(error);
  }
}
