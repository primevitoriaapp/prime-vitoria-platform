import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { clientMayCancelTrip, validateOperationalTransition } from "@/lib/domain/status";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runBestEffort } from "@/lib/server/best-effort";
import { notifyTripStatusTransition } from "@/lib/notifications/trip-status-notify";
import { runPostTripAutomationSafely } from "@/lib/trips/post-trip-automation";
import { driverNextStatuses } from "@/lib/trips/driver-next-status";
import { driverOperationalStatusForTrip } from "@/lib/drivers/operational-status";
import { assertClientMayUsePortalWrites } from "@/lib/clients/client-portal-access";
import { isOperationalTripStatusEvent } from "@/lib/notifications/operational-status-event";
import { finalizeWaitFields } from "@/lib/trips/finalize-trip-wait";
import { odometerDistance, parseOdometer } from "@/lib/trips/odometer";
import { ensureTripTrackToken } from "@/lib/public/ensure-track-token";
import {
  allPickupStopsCompleted,
  hasMultiplePickupStops,
  parseTripPickupStops
} from "@/lib/trips/trip-pickup-stops";

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
  ]),
  actual_km: z.coerce.number().positive().optional(),
  odometer_start: z.union([z.string(), z.number()]).optional(),
  odometer_end: z.union([z.string(), z.number()]).optional()
});

const TRACK_END: string[] = ["completed", "cancelled", "no_show"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const tenantId = assertTenantScope(session);

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (!trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const denied = denyUnlessTripReadable(
      tripGetAccess(
        session,
        {
          client_id: trip.client_id,
          driver_id: trip.driver_id ?? null,
          tenant_id: trip.tenant_id,
          created_by: (trip.created_by as string | null | undefined) ?? null
        },
        session.driverId
      )
    );
    if (denied) return denied;

    if (session.role === "motorista") {
      assertCapability(session, "trip.status");
    } else if (session.role === "cliente") {
      assertCapability(session, "trip.request");
      try {
        await assertClientMayUsePortalWrites(trip.client_id as string, tenantId);
      } catch (error) {
        return mapApiError(error);
      }
      if (body.to_status !== "cancelled") {
        return fail("FORBIDDEN", "Cliente só pode cancelar a solicitação", 403);
      }
      if (!clientMayCancelTrip(trip.operational_status, trip.scheduled_at as string | null)) {
        return fail(
          "INVALID_STATUS_TRANSITION",
          "Esta corrida não pode mais ser cancelada pelo portal. Fale com a central Prime.",
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
        return fail("FORBIDDEN", "Motorista so pode atualizar as proprias corridas", 403);
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

    if (body.to_status === "in_progress" && session.role === "motorista") {
      const stops = parseTripPickupStops(trip.trip_pickup_stops);
      if (hasMultiplePickupStops(stops) && !allPickupStopsCompleted(stops)) {
        return fail(
          "PICKUP_STOPS_PENDING",
          "Conclua todos os embarques antes de iniciar a viagem",
          409
        );
      }
    }

    // KM do painel: inicial ao iniciar a viagem, final ao finalizar. A distância cobrada vem da diferença.
    const odoStart = parseOdometer(body.odometer_start ?? null);
    const odoEnd = parseOdometer(body.odometer_end ?? null);
    if (body.to_status === "in_progress" && session.role === "motorista" && odoStart == null) {
      return fail("ODOMETER_START_REQUIRED", "Informe o KM do painel antes de iniciar a viagem", 400);
    }
    let odometerKm: number | null = null;
    if (body.to_status === "completed" && trip.odometer_start != null && (session.role === "motorista" || odoEnd != null)) {
      const dist = odometerDistance(Number(trip.odometer_start), odoEnd);
      if (!dist.ok) return fail("ODOMETER_INVALID", dist.message, 400);
      odometerKm = dist.km;
    }

    if (body.to_status === "completed" && session.role === "motorista") {
      const kmFromBody = odometerKm ?? body.actual_km;
      if (kmFromBody == null || !Number.isFinite(kmFromBody) || kmFromBody <= 0) {
        return fail("ACTUAL_KM_REQUIRED", "Informe o KM percorrido para finalizar", 400);
      }
      const { data: client } = await db.from("clients").select("type").eq("id", trip.client_id).maybeSingle();
      if (client?.type === "PJ") {
        const { data: sig } = await db.from("trip_signatures").select("id").eq("trip_id", id).maybeSingle();
        if (!sig) return fail("SIGNATURE_REQUIRED", "Colha a assinatura do passageiro (ou informe por que não assinou)", 409);
      }
    }

    const waitFinalize =
      body.to_status === "in_progress" ? finalizeWaitFields(trip.wait_minutes, trip.wait_started_at) : null;

    const statusUpdate: Record<string, unknown> = { operational_status: body.to_status };
    if (waitFinalize) {
      statusUpdate.wait_minutes = waitFinalize.wait_minutes;
      statusUpdate.wait_started_at = waitFinalize.wait_started_at;
    }
    if (body.to_status === "in_progress" && odoStart != null) statusUpdate.odometer_start = odoStart;
    if (odometerKm != null) {
      statusUpdate.odometer_end = odoEnd;
      statusUpdate.actual_km = odometerKm;
      statusUpdate.km_source = "odometer";
      statusUpdate.km_updated_at = new Date().toISOString();
    } else if (body.to_status === "completed" && body.actual_km != null && Number.isFinite(body.actual_km)) {
      statusUpdate.actual_km = body.actual_km;
      statusUpdate.km_source = "manual";
      statusUpdate.km_updated_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("trips")
      .update(statusUpdate)
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

    // Link de acompanhamento do passageiro: nasce no "a caminho" e expira quando a corrida termina.
    if (body.to_status === "on_the_way") {
      await runBestEffort("trip.track_token_on_the_way", () => ensureTripTrackToken(id).then(() => undefined));
    }
    if (TRACK_END.includes(body.to_status)) {
      await runBestEffort("trip.track_token_expire", async () => {
        await db.from("trip_public_track_tokens").update({ expires_at: new Date().toISOString() }).eq("trip_id", id).gt("expires_at", new Date().toISOString());
      });
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

    if (body.to_status === "cancelled") {
      await runBestEffort("trip.status.whatsapp_cancel", async () => {
        const { dispatchTripMessages } = await import("@/lib/messages/dispatch-trip-messages");
        await dispatchTripMessages(tenantId, id, "cancelamento", trip.driver_id ? ["solicitante", "passageiro", "motorista"] : ["solicitante", "passageiro"]);
      });
    }

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
