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
import { redactClientIdentityForDriver, redactTripMoneyForRole } from "@/lib/trips/list-trips-for-session";
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
    const [safe] = redactClientIdentityForDriver([(enriched ?? visible) as Record<string, unknown>], session.role);
    return ok(safe);
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
      const driverId = trip.driver_id as string;
      await runBestEffort("trip.edit.driver_email", async () => {
        const { emailDriverAssignment } = await import("@/lib/notifications/driver-assignment-email");
        await emailDriverAssignment(tenantId, id, driverId, { version: "atualizada" });
      });
      await runBestEffort("trip.edit.driver_push", async () => {
        const { pushTripToDriver } = await import("@/lib/notifications/send-driver-push-now");
        await pushTripToDriver(tenantId, driverId, id, "alterada");
      });
    }

    return ok(saved);
  } catch (error) {
    return mapApiError(error);
  }
}

const STARTED = new Set(["on_the_way", "arrived", "in_progress", "completed"]);

/**
 * Excluir corrida lançada por engano (ex.: duplicada). Só admin/operador, só antes de o motorista sair,
 * sem fatura e sem nada pago. Fica registrado na auditoria com os dados da corrida.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador") return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { data: trip } = await db.from("trips").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);
    // Corrida já feita (ex.: teste): só o administrador, e só confirmando de novo.
    const forced = new URL(request.url).searchParams.get("forcar") === "1";
    if (STARTED.has(trip.operational_status as string)) {
      if (session.role !== "admin") return fail("TRIP_STARTED", "Esta corrida já começou ou terminou: só o administrador pode excluir.", 409);
      if (!forced)
        return fail("TRIP_STARTED_CONFIRM", "Esta corrida já foi feita. Ela vai sumir também do financeiro e da carteira do motorista. Confirme digitando EXCLUIR.", 409);
    }
    if (trip.client_invoice_id) return fail("TRIP_INVOICED", "Esta corrida já está numa fatura: tire da fatura antes de excluir.", 409);
    const [{ data: ar }, { data: dp }] = await Promise.all([
      db.from("accounts_receivable").select("id, status").eq("trip_id", id),
      db.from("driver_payables").select("id, status").eq("trip_id", id)
    ]);
    if ([...(ar ?? []), ...(dp ?? [])].some((r) => r.status !== "open"))
      return fail("TRIP_HAS_PAYMENTS", "Já tem recebimento ou repasse pago nesta corrida: não dá para excluir.", 409);

    await db.from("trips").update({ trip_id_return: null }).eq("trip_id_return", id).eq("tenant_id", tenantId);
    await db.from("driver_locations").delete().eq("trip_id", id);
    if (ar?.length) await db.from("accounts_receivable").delete().eq("trip_id", id);
    if (dp?.length) await db.from("driver_payables").delete().eq("trip_id", id);
    const { error } = await db.from("trips").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("TRIP_DELETE_FAILED", error.message, 500);

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.delete",
      entityType: "trip",
      entityId: id,
      metadata: {
        scheduled_at: trip.scheduled_at,
        client_id: trip.client_id,
        passenger_name: trip.passenger_name,
        origin_text: trip.origin_text,
        destination_text: trip.destination_text,
        notes: trip.notes,
        client_amount: trip.client_amount,
        driver_id: trip.driver_id
      },
      request
    });

    // Motorista já escalado: avisa que a corrida saiu da agenda dele.
    const driverId = trip.driver_id as string | null;
    if (driverId) {
      await runBestEffort("trip.delete.driver_push", async () => {
        const { pushToDriver } = await import("@/lib/push/web-push");
        const quando = new Date(trip.scheduled_at as string).toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
        await pushToDriver(tenantId, driverId, { title: "Corrida cancelada", body: `A corrida de ${quando} saiu da sua agenda.`, url: "/driver", tag: `trip-${id}` });
      });
    }
    return ok({ deleted: id });
  } catch (error) {
    return mapApiError(error);
  }
}
