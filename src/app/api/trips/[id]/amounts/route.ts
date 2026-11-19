import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { ensureDriverPayableFromTripFinancials } from "@/lib/finance/ensure-driver-payable";
import { ensureAccountsReceivableFromTripFinancials } from "@/lib/finance/ensure-accounts-receivable";

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
    const margin = client != null && driver != null ? Math.round((client - driver) * 100) / 100 : client;

    const { data: updated, error } = await db
      .from("trips")
      .update({
        client_amount: client,
        driver_amount: driver,
        margin,
        // Valor digitado é o total fechado: a espera antiga não pode ser descontada/somada de novo num recálculo.
        ...(trip.calculation_metadata && typeof trip.calculation_metadata === "object"
          ? { calculation_metadata: { ...(trip.calculation_metadata as Record<string, unknown>), wait: undefined, valor_digitado: true } }
          : {})
      })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id, client_amount, driver_amount, margin")
      .single();
    if (error) return fail("TRIP_AMOUNTS_FAILED", error.message, 500);

    if (trip.operational_status === "completed") {
      // Corrida que terminou sem preço automático: cria o financeiro agora (antes só atualizava se já existisse).
      await db
        .from("trip_financials")
        .upsert({ trip_id: id, amount_client: client ?? 0, amount_driver: driver ?? 0, net_margin: margin ?? 0 }, { onConflict: "trip_id" });
      if (client != null) {
        await db.from("accounts_receivable").update({ amount: client }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
      }
      if (driver != null) {
        await db.from("driver_payables").update({ amount: driver }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
      }
      // Gera o "a receber" do motorista e o título do cliente se ainda não existirem.
      if (driver != null && driver > 0) await ensureDriverPayableFromTripFinancials(id, tenantId).catch(() => undefined);
      if (client != null && client > 0) await ensureAccountsReceivableFromTripFinancials(id, tenantId).catch(() => undefined);
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
