import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { clientMayCancelTrip, validateOperationalTransition } from "@/lib/domain/status";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { notifyTripStatusTransition } from "@/lib/notifications/trip-status-notify";
import { runPostTripAutomationSafely } from "@/lib/trips/post-trip-automation";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { driverOperationalStatusForTrip } from "@/lib/drivers/operational-status";
import { isOperationalTripStatusEvent } from "@/lib/notifications/operational-status-event";

const bodySchema = z.object({
  to_status: z.enum([
    "requested",
    "approved",
    "dispatched",
    "accepted",
    "on_the_way",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
    "rejected",
    "no_show",
    "reassigned"
  ])
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(session, {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id
      })
    );
    if (denied) return denied;

    if (session.role === "motorista") {
      assertCapability(session, "trip.status");
    } else if (session.role === "cliente") {
      assertCapability(session, "trip.request");
      if (body.to_status !== "cancelled") {
        return fail("FORBIDDEN", "Cliente só pode cancelar a solicitação", 403);
      }
      if (!clientMayCancelTrip(trip.operational_status)) {
        return fail(
          "INVALID_STATUS_TRANSITION",
          "Cancelamento não permitido neste estado da corrida",
          409
        );
      }
    } else {
      assertCapability(session, "trip.write");
    }

    const transition = validateOperationalTransition(trip.operational_status, body.to_status);
    if (!transition.ok) {
      return fail("INVALID_STATUS_TRANSITION", transition.message, 409);
    }

    if (session.role === "motorista") {
      if (!session.driverId || trip.driver_id !== session.driverId) {
        return fail("FORBIDDEN", "Motorista so pode actualizar as proprias corridas", 403);
      }
      const allowed = driverNextStatuses(trip.operational_status);
      if (!allowed.includes(body.to_status)) {
        return fail("INVALID_STATUS_TRANSITION", "Transicao nao permitida para motorista", 409);
      }
    }

    const statusSource = session.role === "motorista" ? "driver" : "admin";
    await db.rpc("set_trip_status_audit_context", {
      p_source: statusSource,
      p_changed_by: session.userId
    });

    const { data, error } = await db
      .from("trips")
      .update({ operational_status: body.to_status })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();

    if (error) return fail("TRIP_STATUS_UPDATE_FAILED", error.message, 500);

    const driverStatus = driverOperationalStatusForTrip(body.to_status);
    if (data.driver_id && driverStatus) {
      await db
        .from("drivers")
        .update({ operational_status: driverStatus, operational_status_updated_at: new Date().toISOString() })
        .eq("id", data.driver_id)
        .eq("tenant_id", tenantId);
    }

    if (body.to_status === "completed") {
      await runPostTripAutomationSafely({ tripId: id, tenantId, actorUserId: session.userId });
    }

    if (body.to_status === "approved" && trip.operational_status !== "approved") {
      const { notifyTripApproved } = await import("@/lib/notifications/operational-notify");
      await notifyTripApproved(tenantId, id).catch(() => {
        /* não bloqueia transição */
      });
    }

    if (isOperationalTripStatusEvent(body.to_status)) {
      const { notifyTripStatusToStaff } = await import("@/lib/notifications/operational-notify");
      await notifyTripStatusToStaff(tenantId, id, body.to_status, {
        driver_id: data.driver_id,
        excludeActorProfileId: session.userId
      }).catch(() => {
        /* não bloqueia transição */
      });
    }

    await notifyTripStatusTransition(tenantId, data, trip.operational_status, body.to_status).catch(() => {
      /* não bloqueia transição */
    });

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.status",
      entityType: "trip",
      entityId: id,
      metadata: { from: trip.operational_status, to: body.to_status },
      request
    });

    return ok(data);
  } catch (error) {
    return mapApiError(error);
  }
}
