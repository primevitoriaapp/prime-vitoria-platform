import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { applyTripAmounts } from "@/lib/trips/apply-trip-amounts";

const money = z.union([z.number(), z.string(), z.null()]).transform((v) => {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
});

const bodySchema = z.object({ client_amount: money.optional(), driver_amount: money.optional() });

/**
 * Central define quanto o cliente paga e quanto o motorista recebe nesta corrida.
 * Se a corrida já foi concluída, ajusta também o financeiro (títulos ainda não pagos).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "operador" && session.role !== "financeiro") {
      return fail("FORBIDDEN", "Sem permissão", 403);
    }
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    const { data: trip } = await db
      .from("trips")
      .select("id, client_amount, driver_amount, driver_id, operational_status, calculation_metadata")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!trip) return fail("TRIP_NOT_FOUND", "Corrida não encontrada", 404);

    const client = body.client_amount !== undefined ? body.client_amount : (trip.client_amount as number | null);
    const driver = body.driver_amount !== undefined ? body.driver_amount : (trip.driver_amount as number | null);
    let updated;
    try {
      updated = await applyTripAmounts(tenantId, id, client, driver);
    } catch (e) {
      return fail("TRIP_AMOUNTS_FAILED", e instanceof Error ? e.message : "Falha ao salvar", 500);
    }

    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: "trip.amounts_updated",
      entityType: "trip",
      entityId: id,
      metadata: { client_amount: client, driver_amount: driver },
      request
    });
    return ok(updated);
  } catch (error) {
    return mapApiError(error);
  }
}
