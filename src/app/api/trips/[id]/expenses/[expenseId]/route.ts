import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Central decide a despesa: aprovada soma no repasse do motorista (reembolso)
 * e, se "cobrar do cliente", soma também no valor da corrida.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; expenseId: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id, expenseId } = await params;
    const b = z.object({ decision: z.enum(["aprovada", "recusada"]), charge_client: z.boolean().default(false) }).parse(await request.json());
    const { data: e } = await db.from("trip_expenses").select("*").eq("id", expenseId).eq("trip_id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!e) return fail("NOT_FOUND", "Despesa não encontrada", 404);
    if (e.status !== "pendente") return fail("ALREADY", "Esta despesa já foi decidida", 409);

    if (b.decision === "aprovada") {
      const { data: t } = await db.from("trips").select("client_amount, driver_amount, operational_status").eq("id", id).maybeSingle();
      const amt = Number(e.amount);
      const driver = r2(Number(t?.driver_amount ?? 0) + amt);
      const client = b.charge_client ? r2(Number(t?.client_amount ?? 0) + amt) : t?.client_amount == null ? null : Number(t.client_amount);
      const margin = client != null ? r2(client - driver) : null;
      await db.from("trips").update({ driver_amount: driver, client_amount: client, margin }).eq("id", id).eq("tenant_id", tenantId);
      if (t?.operational_status === "completed") {
        await db.from("driver_payables").update({ amount: driver }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
        if (b.charge_client && client != null) await db.from("accounts_receivable").update({ amount: client }).eq("trip_id", id).eq("tenant_id", tenantId).neq("status", "paid");
      }
    }
    await db
      .from("trip_expenses")
      .update({ status: b.decision, charge_client: b.charge_client, decided_by: session.userId, decided_at: new Date().toISOString() })
      .eq("id", expenseId);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: `trip.expense_${b.decision}`,
      entityType: "trip",
      entityId: id,
      metadata: { expense_id: expenseId, amount: e.amount, kind: e.kind, charge_client: b.charge_client },
      request
    });
    return ok({ id: expenseId, status: b.decision });
  } catch (error) {
    return mapApiError(error);
  }
}
