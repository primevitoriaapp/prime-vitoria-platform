import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";

const patchSchema = z.object({
  model: z.string().min(2).optional(),
  plate: z.string().min(7).optional(),
  category: z.string().nullable().optional(),
  capacity: z.number().int().nullable().optional(),
  color: z.string().nullable().optional(),
  active: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "vehicle.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    if (Object.keys(body).length === 0) {
      return fail("INVALID_BODY", "Nenhum campo para actualizar", 400);
    }

    const { data: existing, error: getErr } = await db
      .from("vehicles")
      .select("id, plate, model")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (getErr || !existing) {
      return fail("VEHICLE_NOT_FOUND", "Veiculo nao encontrado", 404);
    }

    const { data, error } = await db
      .from("vehicles")
      .update(body)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("VEHICLE_PLATE_CONFLICT", "Ja existe veiculo com esta placa", 409);
      }
      return fail("VEHICLE_UPDATE_FAILED", error.message, 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: body.active === false ? "vehicle.deactivate" : "vehicle.update",
      entityType: "vehicle",
      entityId: id,
      metadata: { plate: data.plate, model: data.model },
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
