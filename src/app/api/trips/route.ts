import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { assertCapability } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { resolvePricingServiceType } from "@/lib/pricing/corporativo-bandeira";
import {
  maxPassengersForService,
  normalizePrimeServiceType
} from "@/lib/pricing/prime-service-types";
import {
  firstLegScheduledAtIso,
  legScheduledAtRange,
  sumLegAmounts,
  tripLegsSchema
} from "@/lib/trips/trip-legs";
import {
  pickupStopsForStorage,
  tripPickupStopsSchema
} from "@/lib/trips/trip-pickup-stops";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { listTripsForSession } from "@/lib/trips/list-trips-for-session";
import { resolveTripTenantId } from "@/lib/trips/resolve-trip-tenant";
import { assertClientMayUsePortalWrites } from "@/lib/clients/client-portal-access";
import { normalizeScheduledAtForStorage, validatePortalScheduledAt } from "@/lib/dates/br-date";
import { notifyPortalTripRequestedEmail } from "@/lib/notifications/portal-trip-request-email";
import {
  initialTripApprovalFieldsForSession,
  initialTripOperationalStatusForSession
} from "@/lib/trips/initial-trip-status";

const coordSchema = z.union([z.number(), z.string()]).optional().nullable().transform((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
});

const createTripSchema = z.object({
  client_id: z.string().uuid(),
  requester_id: z.string().uuid().optional(),
  cost_center_id: z.string().uuid().optional(),
  service_type: z.string().min(2),
  scheduled_at: z.string(),
  origin_text: z.string().min(3),
  origin_lat: coordSchema,
  origin_lng: coordSchema,
  destination_text: z.string().min(3),
  destination_lat: coordSchema,
  destination_lng: coordSchema,
  dispatch_mode: z.enum(["directed", "offer"]).default("directed"),
  passenger_name: z.string().optional(),
  passenger_phone: z.string().optional(),
  passenger_count: z.coerce.number().int().min(1).optional(),
  notes: z.string().optional(),
  client_amount: z.coerce.number().nonnegative().optional(),
  driver_amount: z.coerce.number().nonnegative().optional(),
  margin: z.coerce.number().optional(),
  trip_legs: tripLegsSchema.optional(),
  trip_pickup_stops: tripPickupStopsSchema.optional(),
  round_trip: z.boolean().optional(),
  return_scheduled_at: z.string().optional()
});

function mapTripError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Forbidden:")) {
    return fail("FORBIDDEN", message.replace(/^Forbidden:\s*/, ""), 403);
  }
  return fail("INVALID_REQUEST", message, 400);
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    enforceRateLimit(`trip:create:${ip}`, 60, 60_000);
    const session = await getSessionContext();
    assertCapability(session, session.role === "cliente" ? "trip.request" : "trip.write");

    const raw = (await request.json()) as Record<string, unknown>;
    if (Array.isArray(raw.trip_legs) && raw.trip_legs.length > 0) {
      const legs = raw.trip_legs as Array<Record<string, unknown>>;
      const first = legs[0];
      const last = legs[legs.length - 1];
      if (typeof first?.origin_text === "string" && first.origin_text.length >= 2) {
        raw.origin_text = first.origin_text;
      }
      if (typeof last?.destination_text === "string" && last.destination_text.length >= 2) {
        raw.destination_text = last.destination_text;
      }
      const legSchedule =
        typeof first?.scheduled_at === "string" && first.scheduled_at.trim()
          ? first.scheduled_at
          : null;
      if (legSchedule) {
        raw.scheduled_at = legSchedule;
      }
    }
    const body = createTripSchema.parse(raw);
    const sessionTenantId = assertTenantScope(session);

    if (session.role === "cliente") {
      if (!session.clientId) {
        return fail("FORBIDDEN", "Cliente precisa de escopo de cliente (x-client-id ou perfil)", 403);
      }
      if (body.client_id !== session.clientId) {
        return fail("FORBIDDEN", "Nao e possivel solicitar corrida para outro cliente", 403);
      }
    }

    const { data: clientRow, error: clientErr } = await db
      .from("clients")
      .select("id, tenant_id, name")
      .eq("id", body.client_id)
      .single();
    if (clientErr || !clientRow) {
      return fail("CLIENT_NOT_FOUND", "Cliente nao encontrado", 404);
    }

    let tenantId: string;
    try {
      tenantId = resolveTripTenantId(
        session,
        clientRow.tenant_id as string | null | undefined,
        sessionTenantId
      );
    } catch {
      return fail("FORBIDDEN", "Cliente nao pertence a esta organizacao", 403);
    }

    if (session.role === "cliente") {
      try {
        await assertClientMayUsePortalWrites(body.client_id, tenantId);
      } catch (error) {
        return mapTripError(error);
      }
    }

    const uiServiceType = normalizePrimeServiceType(body.service_type);
    const legs = body.trip_legs;
    const pickupStops = body.trip_pickup_stops;
    if (legs?.length && pickupStops?.length) {
      return fail(
        "INVALID_TRIP_SHAPE",
        "Use trechos múltiplos ou paradas de embarque, não ambos",
        400
      );
    }
    const legTotals = legs?.length ? sumLegAmounts(legs) : null;
    const legScheduleIso = legs?.length ? firstLegScheduledAtIso(legs) : null;
    const scheduledAtRaw = legScheduleIso ?? body.scheduled_at;
    let scheduledAt: string;
    if (session.role === "cliente") {
      const scheduleCheck = validatePortalScheduledAt(scheduledAtRaw);
      if (!scheduleCheck.ok) {
        return fail("INVALID_SCHEDULED_AT", scheduleCheck.message, 400);
      }
      scheduledAt = scheduleCheck.iso;
    } else {
      scheduledAt =
        legScheduleIso ??
        normalizeScheduledAtForStorage(body.scheduled_at) ??
        body.scheduled_at;
    }
    const initialStatus = initialTripOperationalStatusForSession(session);
    const approvalFields = initialTripApprovalFieldsForSession(session, session.userId);

    const serviceType = resolvePricingServiceType(uiServiceType, scheduledAt);
    const maxPassengers = maxPassengersForService(uiServiceType);
    const passengerCount = pickupStops?.length ?? body.passenger_count ?? 1;
    if (passengerCount > maxPassengers) {
      return fail(
        "INVALID_PASSENGER_COUNT",
        `Número de passageiros excede o máximo (${maxPassengers}) para este serviço`,
        400
      );
    }

    const clientAmount =
      legTotals?.client_amount ?? body.client_amount ?? null;
    const driverAmount =
      legTotals?.driver_amount ?? body.driver_amount ?? null;
    const margin =
      legTotals?.margin ??
      (body.margin != null
        ? body.margin
        : clientAmount != null && driverAmount != null
          ? Math.round((clientAmount - driverAmount) * 100) / 100
          : null);

    const originText = pickupStops?.length
      ? pickupStops[0].pickup_text
      : legs?.length
        ? legs[0].origin_text
        : body.origin_text;
    const destinationText = legs?.length ? legs[legs.length - 1].destination_text : body.destination_text;
    const originLat = pickupStops?.length
      ? (pickupStops[0].pickup_lat ?? null)
      : legs?.length
        ? (legs[0].origin_lat ?? null)
        : body.origin_lat;
    const originLng = pickupStops?.length
      ? (pickupStops[0].pickup_lng ?? null)
      : legs?.length
        ? (legs[0].origin_lng ?? null)
        : body.origin_lng;
    const destLat = legs?.length
      ? (legs[legs.length - 1].destination_lat ?? null)
      : body.destination_lat;
    const destLng = legs?.length
      ? (legs[legs.length - 1].destination_lng ?? null)
      : body.destination_lng;

    const { data, error } = await db
      .from("trips")
      .insert({
        client_id: body.client_id,
        requester_id: body.requester_id ?? null,
        cost_center_id: body.cost_center_id ?? null,
        service_type: serviceType,
        scheduled_at: scheduledAt,
        origin_text: originText,
        origin_lat: originLat,
        origin_lng: originLng,
        destination_text: destinationText,
        destination_lat: destLat,
        destination_lng: destLng,
        trip_legs: legs?.length ? legs : null,
        trip_pickup_stops: pickupStops?.length ? pickupStopsForStorage(pickupStops) : null,
        dispatch_mode: body.dispatch_mode,
        passenger_name: pickupStops?.length
          ? pickupStops[0].passenger_name
          : body.passenger_name ?? null,
        passenger_phone: pickupStops?.length
          ? pickupStops[0].passenger_phone ?? null
          : body.passenger_phone ?? null,
        passenger_count: passengerCount,
        notes: body.notes ?? null,
        client_amount: clientAmount,
        driver_amount: driverAmount,
        margin,
        tenant_id: tenantId,
        created_by: session.userId,
        operational_status: initialStatus,
        ...approvalFields
      })
      .select("*")
      .single();

    if (error) {
      return fail("TRIP_CREATE_FAILED", error.message, 500);
    }

    let outbound = data;

    async function upsertTripFinancials(tripId: string) {
      if (clientAmount == null || driverAmount == null) return;
      const netMargin = margin ?? clientAmount - driverAmount;
      await db.from("trip_financials").upsert(
        {
          trip_id: tripId,
          amount_client: clientAmount,
          amount_driver: driverAmount,
          net_margin: netMargin
        },
        { onConflict: "trip_id" }
      );
    }

    await upsertTripFinancials(outbound.id as string);

    if (body.round_trip && body.return_scheduled_at && !legs?.length) {
      const returnScheduled =
        normalizeScheduledAtForStorage(body.return_scheduled_at) ?? body.return_scheduled_at;

      if (new Date(returnScheduled).getTime() <= new Date(scheduledAt).getTime()) {
        await db.from("trips").delete().eq("id", outbound.id);
        return fail("INVALID_RETURN_TIME", "Horário de retorno deve ser após a ida", 400);
      }

      const { data: returnTrip, error: returnErr } = await db
        .from("trips")
        .insert({
          client_id: body.client_id,
          requester_id: body.requester_id ?? null,
          cost_center_id: body.cost_center_id ?? null,
          service_type: serviceType,
          scheduled_at: returnScheduled,
          origin_text: destinationText,
          origin_lat: destLat,
          origin_lng: destLng,
          destination_text: originText,
          destination_lat: originLat,
          destination_lng: originLng,
          dispatch_mode: body.dispatch_mode,
          passenger_name: body.passenger_name ?? null,
          passenger_phone: body.passenger_phone ?? null,
          passenger_count: passengerCount,
          notes: body.notes ?? null,
          client_amount: clientAmount,
          driver_amount: driverAmount,
          margin,
          tenant_id: tenantId,
          created_by: session.userId,
          operational_status: initialStatus,
          ...approvalFields,
          trip_leg_label: "volta"
        })
        .select("*")
        .single();

      if (returnErr || !returnTrip) {
        await db.from("trips").delete().eq("id", outbound.id);
        return fail("TRIP_RETURN_CREATE_FAILED", returnErr?.message ?? "Falha ao criar volta", 500);
      }

      const { data: linkedOutbound, error: linkErr } = await db
        .from("trips")
        .update({ trip_id_return: returnTrip.id, trip_leg_label: "ida" })
        .eq("id", outbound.id)
        .select("*")
        .single();

      if (linkErr || !linkedOutbound) {
        await db.from("trips").delete().eq("id", returnTrip.id);
        await db.from("trips").delete().eq("id", outbound.id);
        return fail("TRIP_LINK_FAILED", linkErr?.message ?? "Falha ao vincular ida/volta", 500);
      }

      outbound = linkedOutbound;
      await upsertTripFinancials(returnTrip.id as string);

      await insertAuditEvent({
        tenantId,
        actorUserId: session.userId,
        action: "trip.create",
        entityType: "trip",
        entityId: returnTrip.id as string,
        metadata: {
          client_id: body.client_id,
          operational_status: returnTrip.operational_status,
          trip_leg_label: "volta",
          linked_outbound_id: outbound.id
        },
        request
      });

      const { notifyTripRequested: notifyReturn } = await import("@/lib/notifications/operational-notify");
      await notifyReturn(tenantId, returnTrip.id as string, { client_id: body.client_id });
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.create",
      entityType: "trip",
      entityId: outbound.id,
      metadata: {
        client_id: body.client_id,
        operational_status: outbound.operational_status,
        trip_leg_label: outbound.trip_leg_label ?? null
      },
      request
    });

    const { notifyTripRequested } = await import("@/lib/notifications/operational-notify");
    await notifyTripRequested(tenantId, outbound.id as string, { client_id: body.client_id });

    if (initialStatus === "requested") {
      const emailInput = {
        clientName: String(clientRow.name ?? "Cliente"),
        serviceType: String(outbound.service_type ?? serviceType),
        scheduledAt: String(outbound.scheduled_at ?? scheduledAt),
        originText: String(outbound.origin_text ?? originText),
        destinationText: String(outbound.destination_text ?? destinationText),
        tripId: String(outbound.id)
      };
      const emailResult = await notifyPortalTripRequestedEmail(emailInput);
      if (!emailResult.sent) {
        await insertAuditEvent({
          tenantId,
          actorUserId: session.userId,
          action: "notification.email_failed",
          entityType: "trip",
          entityId: outbound.id as string,
          metadata: {
            channel: "portal_trip_request",
            reason: emailResult.reason ?? "unknown"
          },
          request
        });
      }
    }

    return ok(outbound, 201);
  } catch (error) {
    return mapTripError(error);
  }
}

export async function GET(request: Request) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    const result = await listTripsForSession(session, new URL(request.url).searchParams);
    return ok(result);
  } catch (error) {
    return mapTripError(error);
  }
}
