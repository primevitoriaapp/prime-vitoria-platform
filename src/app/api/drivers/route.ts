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
    const { profile_name, profile_id: bodyProfileId, cpf: _cpf, cnh_number, ...rest } = parsed;
    const body = normalizeDriverBody({ ...rest, cnh_number });

    let profileId = bodyProfileId;
    if (!profileId) {
      const { data: motoristaProfiles } = await db
        .from("profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("role", "motorista")
        .eq("active", true)
        .limit(100);
      const { data: linked } = await db.from("drivers").select("profile_id").eq("tenant_id", tenantId);
      const linkedSet = new Set((linked ?? []).map((r) => r.profile_id));
      const free = (motoristaProfiles ?? []).find((p) => !linkedSet.has(p.id));
      if (!free) {
        return fail(
          "NO_DRIVER_PROFILE",
          "Não há perfil motorista livre para vincular.",
          409,
          "Crie um utilizador com perfil motorista em Utilizadores ou informe profile_id."
        );
      }
      profileId = free.id;
    }

    const insertRow = { ...body, profile_id: profileId, cpf: parsed.cpf.trim() };

    const { data: prof, error: pe } = await db
      .from("profiles")
      .select("tenant_id")
      .eq("id", profileId)
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
      metadata: { profile_id: profileId, partialSave: partialSave ?? false },
      request
    });

    if (profile_name !== undefined) {
      await db.from("profiles").update({ name: profile_name.trim() }).eq("id", profileId);
    }

    const driverRow = {
      ...(data as Record<string, unknown>),
      id: String((data as Record<string, unknown>).id),
      profile_id: profileId
    } as { id: string; profile_id: string };
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
