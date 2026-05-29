import { db } from "@/lib/server/db";
import { vehicleCadastroSchema, normalizeVehicleBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "vehicle.write");
    const tenantId = assertTenantScope(session);
    const parsed = vehicleCadastroSchema.parse(await request.json());
    const body = normalizeVehicleBody(parsed);
    const { data, error } = await db
      .from("vehicles")
      .insert({ ...body, tenant_id: tenantId, active: body.active ?? true })
      .select("*")
      .single();
    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("VEHICLE_PLATE_CONFLICT", "Ja existe veiculo com esta placa", 409);
      }
      return fail("VEHICLE_CREATE_FAILED", error.message, 500);
    }
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "vehicle.create",
      entityType: "vehicle",
      entityId: data.id,
      metadata: { plate: body.plate, model: body.model },
      request
    });
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "vehicle.read");
    const tenantId = assertTenantScope(session);
    const { data, error } = await db.from("vehicles").select("*").eq("active", true).eq("tenant_id", tenantId).limit(200);
    if (error) return fail("VEHICLE_LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
