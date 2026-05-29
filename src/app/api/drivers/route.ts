import { db } from "@/lib/server/db";
import { driverCreateSchema, normalizeDriverBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
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
      return fail("FORBIDDEN", "Perfil invalido ou de outra organizacao", 403);
    }

    const { data, error } = await db.from("drivers").insert({ ...insertRow, tenant_id: tenantId }).select("*").single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("DRIVER_PROFILE_CONFLICT", "Ja existe motorista vinculado a este perfil", 409);
      }
      return fail("DRIVER_CREATE_FAILED", error.message, 500);
    }
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.create",
      entityType: "driver",
      entityId: data.id,
      metadata: { profile_id: parsed.profile_id },
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

    const [enriched] = await attachDefaultVehiclesToDrivers(await attachProfileNamesToDrivers([data]));
    return ok(enriched, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const { data, error } = await db.from("drivers").select("*").eq("active", true).eq("tenant_id", tenantId).limit(200);
    if (error) return fail("DRIVER_LIST_FAILED", error.message, 500);
    const withProfiles = await attachProfileNamesToDrivers(data ?? []);
    const withVehicles = await attachDefaultVehiclesToDrivers(withProfiles);
    return ok(withVehicles);
  } catch (error) {
    return mapApiError(error);
  }
}
