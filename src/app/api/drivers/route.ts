import { db } from "@/lib/server/db";
import { insertDriverRow } from "@/lib/drivers/driver-db";
import {
  driverCreateSchema,
  normalizeDriverBody,
  resolveDriverDisplayName
} from "@/lib/drivers/driver-cadastro-schema";
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
    const displayName = resolveDriverDisplayName(parsed);
    const { profile_id: bodyProfileId, cpf: _cpf, cnh_number, full_name: _fn, profile_name: _pn, ...rest } = parsed;
    const body = normalizeDriverBody({ ...rest, cnh_number, full_name: displayName });

    const insertRow: Record<string, unknown> = {
      ...body,
      cpf: parsed.cpf.trim(),
      full_name: displayName
    };

    if (bodyProfileId) {
      const { data: prof, error: pe } = await db
        .from("profiles")
        .select("tenant_id")
        .eq("id", bodyProfileId)
        .maybeSingle();
      if (pe || !prof || prof.tenant_id !== tenantId) {
        return fail("FORBIDDEN", "Perfil inválido ou de outra organização", 403);
      }
      insertRow.profile_id = bodyProfileId;
      await db.from("profiles").update({ name: displayName }).eq("id", bodyProfileId);
    }

    const { data, error, partialSave, warning } = await insertDriverRow(insertRow, tenantId);

    if (error || !data) {
      if (error && isPostgresUniqueViolation(error)) {
        const msg = error.message ?? "";
        if (/cpf/i.test(msg)) {
          return fail("DRIVER_CPF_CONFLICT", "Já existe motorista com este CPF", 409);
        }
        return fail("DRIVER_PROFILE_CONFLICT", "Já existe motorista vinculado a este perfil", 409);
      }
      const mapped = mapSupabaseError(error!, "motorista");
      if (/profile_id|null/i.test(mapped.message)) {
        return fail(
          "DRIVER_SCHEMA_OUTDATED",
          "Cadastro sem perfil exige migration 0048 no Supabase.",
          503,
          "Execute npm run db:apply-p1-staging com STAGING_DATABASE_URL."
        );
      }
      return fail(mapped.code, mapped.message, mapped.status, mapped.hint);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.create",
      entityType: "driver",
      entityId: String(data.id),
      metadata: {
        profile_id: (data as Record<string, unknown>).profile_id ?? null,
        full_name: displayName,
        partialSave: partialSave ?? false
      },
      request
    });

    const driverRow = {
      ...(data as Record<string, unknown>),
      id: String((data as Record<string, unknown>).id)
    } as { id: string; profile_id?: string | null; full_name?: string | null };
    const [enriched] = await attachDefaultVehiclesToDrivers(await attachProfileNamesToDrivers([driverRow]));
    const apiWarning =
      warning ??
      (partialSave
        ? "Motorista criado com dados essenciais. Aplique migrations 0044–0048 no Supabase para a ficha completa."
        : undefined);

    return ok({ ...enriched, ...(apiWarning ? { _warning: apiWarning } : {}) }, 201);
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
