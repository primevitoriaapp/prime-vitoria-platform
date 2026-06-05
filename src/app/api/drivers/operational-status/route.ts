import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { insertAuditEvent } from "@/lib/server/audit-log";
import {
  DRIVER_MANUAL_STATUS_BLOCKING_TRIP_STATUSES,
  DRIVER_OPERATIONAL_STATUS_VALUES,
  isDriverOperationalStatus
} from "@/lib/drivers/operational-status";
import type { DriverOperationalStatus } from "@/lib/domain/types";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";

const bodySchema = z.object({
  driver_id: z.string().uuid().optional(),
  status: z.enum(DRIVER_OPERATIONAL_STATUS_VALUES as [DriverOperationalStatus, ...DriverOperationalStatus[]])
});

async function resolveDriverId(session: Awaited<ReturnType<typeof getSessionContext>>, requested?: string) {
  const resolved = await withResolvedDriverId(session);
  if (resolved.role === "motorista") {
    return resolved.driverId ?? null;
  }
  if (session.role === "admin" || session.role === "operador") {
    return requested ?? null;
  }
  return requested ?? null;
}

export async function GET(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const requested = new URL(request.url).searchParams.get("driver_id") ?? undefined;
    const driverId = await resolveDriverId(session, requested);

    if (session.role !== "motorista") {
      assertCapability(session, "driver.read");
    }
    if (!driverId) return fail("DRIVER_ID_REQUIRED", "driver_id obrigatorio", 400);

    const { data, error } = await db
      .from("drivers")
      .select("id, operational_status, operational_status_updated_at")
      .eq("id", driverId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) return fail("DRIVER_STATUS_FAILED", error.message, 500);
    if (!data) return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);

    return ok({
      driver_id: data.id,
      status: isDriverOperationalStatus(data.operational_status) ? data.operational_status : "offline",
      updated_at: data.operational_status_updated_at
    });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json());
    const driverId = await resolveDriverId(session, body.driver_id);

    if (session.role !== "motorista") {
      assertCapability(session, "trip.write");
    } else if (body.status !== "online" && body.status !== "offline") {
      return fail("INVALID_DRIVER_STATUS", "Motorista so pode alternar online/offline manualmente", 400);
    }
    if (!driverId) return fail("DRIVER_ID_REQUIRED", "driver_id obrigatorio", 400);

    if (session.role === "motorista") {
      const { data: activeTrip, error: activeTripError } = await db
        .from("trips")
        .select("id, operational_status")
        .eq("tenant_id", tenantId)
        .eq("driver_id", driverId)
        .in("operational_status", [...DRIVER_MANUAL_STATUS_BLOCKING_TRIP_STATUSES])
        .limit(1)
        .maybeSingle();

      if (activeTripError) return fail("DRIVER_ACTIVE_TRIP_CHECK_FAILED", activeTripError.message, 500);
      if (activeTrip) {
        return fail(
          "DRIVER_STATUS_LOCKED_BY_TRIP",
          "Finalize ou atualize a corrida ativa antes de alterar disponibilidade manualmente",
          409
        );
      }
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await db
      .from("drivers")
      .update({ operational_status: body.status, operational_status_updated_at: updatedAt })
      .eq("id", driverId)
      .eq("tenant_id", tenantId)
      .select("id, operational_status, operational_status_updated_at")
      .maybeSingle();

    if (error) return fail("DRIVER_STATUS_UPDATE_FAILED", error.message, 500);
    if (!data) return fail("DRIVER_NOT_FOUND", "Motorista nao encontrado", 404);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "driver.operational_status",
      entityType: "driver",
      entityId: driverId,
      metadata: { status: body.status },
      request
    });

    return ok({
      driver_id: data.id,
      status: data.operational_status,
      updated_at: data.operational_status_updated_at
    });
  } catch (error) {
    return mapApiError(error);
  }
}
