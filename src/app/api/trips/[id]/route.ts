import { z } from "zod";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { runBestEffort } from "@/lib/server/best-effort";
import { normalizeFlightNumber } from "@/lib/trips/flight";
import { cleanServiceExtras } from "@/lib/trips/service-extras";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { denyUnlessTripReadable, tripGetAccess } from "@/lib/trips/trip-detail-access";
import { redactTripMoneyForRole } from "@/lib/trips/list-trips-for-session";
import { enrichTripListItems } from "@/lib/trips/enrich-trip-list";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    const { id } = await params;
    const tenantId = assertTenantScope(session);

    const { data: trip, error } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).single();
    if (error || !trip) return fail("TRIP_NOT_FOUND", "Trip not found", 404);

    const access = tripGetAccess(
      session,
      {
        client_id: trip.client_id,
        driver_id: trip.driver_id ?? null,
        tenant_id: trip.tenant_id,
        created_by: (trip.created_by as string | null | undefined) ?? null
      },
      session.driverId
    );
    const denied = denyUnlessTripReadable(access);
    if (denied) return denied;

    const [visible] = redactTripMoneyForRole([trip as Record<string, unknown>], session.role);
    // Nome do motorista e veículo (para o detalhe no portal e no app).
    const [enriched] = await enrichTripListItems([visible as typeof visible & { client_id: string }]).catch(() => [visible]);
    return ok(enriched ?? visible);
  } catch (error) {
    return mapApiError(error);
  }
}

const LOCKED_STATUSES = new Set(["completed", "cancelled", "rejected", "no_show"]);

const patchSchema = z.object({
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  origin_text: z.string().min(3).optional(),
  origin_lat: z.number().nullable().optional(),
  origin_lng: z.number().nullable().optional(),
  destination_text: z.string().min(3).optional(),
  destination_lat: z.number().nullable().optional(),
  destination_lng: z.number().nullable().optional(),
  passenger_name: z.string().max(200).nullable().optional(),
  passenger_phone: z.string().max(40).nullable().optional(),
  passenger_count: z.coerce.number().int().min(1).max(80).optional(),
  flight_number: z.string().max(12).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  presentation_minutes: z.coerce.number().int().min(0).max(240).nullable().optional(),
  service_extras: z.array(z.string()).max(20).optional(),
  reason: z.string().max(300).optional()
});

/** Central edita os dados da corrida (horário, trajeto, passageiro, marcações). Fica registrado quem mudou e o quê. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);

    const { reason, ...fields } = body;
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (k === "flight_number") update[k] = normalizeFlightNumber(v as string | null);
      else if (k === "service_extras") update[k] = cleanServiceExtras(v);
      else if (typeof v === "string") update[k] = v.trim() === "" && k !== "origin_text" && k !== "destination_text" ? null : v.trim();
      else update[k] = v;
    }

    // Corrida encerrada: só observação pode mudar (valor é na tela de valores).
    if (LOCKED_STATUSES.has(trip.operational_status as string)) {
      const keys = Object.keys(update).filter((k) => k !== "notes");
      if (keys.length) return fail("TRIP_LOCKED", "Corrida encerrada: só as observações podem ser alteradas.", 409);
    }

    const changed: Record<string, { de: unknown; para: unknown }> = {};
    for (const [k, v] of Object.entries(update)) {
      const before = (trip as Record<string, unknown>)[k];
      if (JSON.stringify(before ?? null) !== JSON.stringify(v ?? null)) changed[k] = { de: before ?? null, para: v ?? null };
    }
    if (Object.keys(changed).length === 0) return ok({ ...trip, _unchanged: true });

    const { data: saved, error } = await db
      .from("trips")
      .update(Object.fromEntries(Object.keys(changed).map((k) => [k, update[k]])))
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (error) return fail("TRIP_UPDATE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.edit",
      entityType: "trip",
      entityId: id,
      metadata: { campos: changed, motivo: reason?.trim() || null },
      request
    });

    // Motorista já definido e mudou algo que ele precisa saber: manda a O.S. atualizada (se o WhatsApp estiver ligado).
    const relevant = ["scheduled_at", "origin_text", "destination_text", "passenger_name", "passenger_phone", "flight_number", "presentation_minutes", "service_extras", "notes"];
    if (trip.driver_id && Object.keys(changed).some((k) => relevant.includes(k))) {
      await runBestEffort("trip.edit.driver_os", async () => {
        const { dispatchTripMessages } = await import("@/lib/messages/dispatch-trip-messages");
        await dispatchTripMessages(tenantId, id, "os_motorista", ["motorista"], { replace: true });
      });
    }

    return ok(saved);
  } catch (error) {
    return mapApiError(error);
  }
}
