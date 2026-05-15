import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { setDefaultVehicleForDriver, resolveDefaultVehicleForDriver } from "@/lib/vehicles/driver-default-vehicle";

const bodySchema = z.object({
  vehicle_id: z.string().uuid()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const vehicle = await resolveDefaultVehicleForDriver(id);
    if (!vehicle) {
      return ok({ vehicle: null });
    }

    const { data: row } = await db.from("drivers").select("tenant_id").eq("id", id).maybeSingle();
    if (!row || row.tenant_id !== tenantId) {
      return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);
    }

    return ok({ vehicle });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    await setDefaultVehicleForDriver({
      tenantId,
      driverId: id,
      vehicleId: body.vehicle_id
    });

    const vehicle = await resolveDefaultVehicleForDriver(id);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.default_vehicle.set",
      entityType: "driver",
      entityId: id,
      metadata: { vehicle_id: body.vehicle_id },
      request
    });

    return ok({ vehicle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message.includes("nao encontrado")) {
      return fail("NOT_FOUND", message, 404);
    }
    return mapApiError(error);
  }
}
