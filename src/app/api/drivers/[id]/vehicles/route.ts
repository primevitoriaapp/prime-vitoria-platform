import { z } from "zod";
import { db } from "@/lib/server/db";
import { vehicleCadastroSchema, normalizeVehicleBody } from "@/lib/drivers/driver-cadastro-schema";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { isPostgresUniqueViolation } from "@/lib/server/postgres-errors";
import {
  linkVehicleToDriver,
  listLinkedVehiclesForDriver,
  setDefaultVehicleForDriver,
  unlinkVehicleFromDriver
} from "@/lib/vehicles/driver-default-vehicle";

const linkSchema = z.object({
  vehicle_id: z.string().uuid(),
  set_default: z.boolean().optional()
});

const createAndLinkSchema = vehicleCadastroSchema.extend({
  set_default: z.boolean().optional()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "driver.read");
    const tenantId = assertTenantScope(session);
    const { id } = await params;

    const { data: driver } = await db.from("drivers").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!driver) return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);

    const vehicles = await listLinkedVehiclesForDriver(id);
    return ok(vehicles);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id: driverId } = await params;
    const raw = await request.json();

    if (raw.vehicle_id) {
      const body = linkSchema.parse(raw);
      await linkVehicleToDriver({
        tenantId,
        driverId,
        vehicleId: body.vehicle_id,
        setDefault: body.set_default
      });
      const vehicles = await listLinkedVehiclesForDriver(driverId);
      return ok(vehicles, 201);
    }

    const body = createAndLinkSchema.parse(raw);
    const vehiclePayload = normalizeVehicleBody(body);
    const { data: vehicle, error } = await db
      .from("vehicles")
      .insert({ ...vehiclePayload, tenant_id: tenantId, active: vehiclePayload.active ?? true })
      .select("*")
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        return fail("VEHICLE_PLATE_CONFLICT", "Ja existe veiculo com esta placa", 409);
      }
      return fail("VEHICLE_CREATE_FAILED", error.message, 500);
    }

    await linkVehicleToDriver({
      tenantId,
      driverId,
      vehicleId: vehicle.id,
      setDefault: body.set_default ?? true
    });

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.vehicle.link",
      entityType: "driver",
      entityId: driverId,
      metadata: { vehicle_id: vehicle.id, plate: vehicle.plate },
      request
    });

    const vehicles = await listLinkedVehiclesForDriver(driverId);
    return ok({ vehicle, linked_vehicles: vehicles }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message.includes("nao encontrado")) {
      return fail("NOT_FOUND", message, 404);
    }
    return mapApiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { id: driverId } = await params;
    const body = z
      .object({
        vehicle_id: z.string().uuid(),
        action: z.enum(["set_default", "unlink"])
      })
      .parse(await request.json());

    if (body.action === "unlink") {
      await unlinkVehicleFromDriver({ tenantId, driverId, vehicleId: body.vehicle_id });
    } else {
      await setDefaultVehicleForDriver({ tenantId, driverId, vehicleId: body.vehicle_id });
    }

    const vehicles = await listLinkedVehiclesForDriver(driverId);
    return ok(vehicles);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    if (message.includes("nao encontrado")) {
      return fail("NOT_FOUND", message, 404);
    }
    return mapApiError(error);
  }
}
