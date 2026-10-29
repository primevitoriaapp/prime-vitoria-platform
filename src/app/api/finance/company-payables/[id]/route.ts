import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { nextMonthlyDue } from "@/lib/finance/company-payables-calc";
import { payableSchema, staffFinance } from "@/lib/finance/company-payables-schema";

const patchSchema = payableSchema
  .omit({ installments: true })
  .partial()
  .extend({
    action: z.enum(["pagar", "reabrir", "cancelar"]).optional(),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    paid_amount: z.union([z.number(), z.string()]).optional()
  });

/** Editar, dar baixa (pagar), reabrir ou cancelar. Conta mensal paga gera a do mês seguinte. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staffFinance(session.role)) return fail("FORBIDDEN", "Sem acesso ao financeiro", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const { data: row } = await db.from("company_payables").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!row) return fail("NOT_FOUND", "Conta não encontrada", 404);

    const { action, paid_at, paid_amount, ...fields } = body;
    const update: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };
    let created: unknown = null;

    if (action === "pagar") {
      const amt = paid_amount == null ? Number(row.amount) : Number(String(paid_amount).replace(/\./g, "").replace(",", "."));
      update.status = "paga";
      update.paid_at = paid_at ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      update.paid_amount = Number.isFinite(amt) ? Math.round(amt * 100) / 100 : Number(row.amount);
      if (row.recurrence === "mensal" && row.status !== "paga") {
        const next = nextMonthlyDue(row.due_date as string);
        const { data: exists } = await db
          .from("company_payables")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("description", row.description)
          .eq("due_date", next)
          .maybeSingle();
        if (!exists) {
          const { data: n } = await db
            .from("company_payables")
            .insert({
              tenant_id: tenantId,
              description: row.description,
              category: row.category,
              supplier: row.supplier,
              amount: row.amount,
              due_date: next,
              recurrence: "mensal",
              issuer: row.issuer,
              notes: row.notes,
              created_by: session.userId
            })
            .select("*")
            .single();
          created = n;
        }
      }
    } else if (action === "reabrir") {
      update.status = "aberta";
      update.paid_at = null;
      update.paid_amount = null;
    } else if (action === "cancelar") {
      update.status = "cancelada";
    }

    const { data, error } = await db.from("company_payables").update(update).eq("id", id).eq("tenant_id", tenantId).select("*").single();
    if (error) return fail("UPDATE_FAILED", error.message, 500);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: `company_payable.${action ?? "edit"}`,
      entityType: "company_payable",
      entityId: id,
      metadata: { description: row.description },
      request
    });
    return ok({ payable: data, next: created });
  } catch (error) {
    return mapApiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin") return fail("FORBIDDEN", "Só o administrador exclui contas", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const { error } = await db.from("company_payables").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) return fail("DELETE_FAILED", error.message, 500);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "company_payable.delete", entityType: "company_payable", entityId: id, request });
    return ok({ deleted: true });
  } catch (error) {
    return mapApiError(error);
  }
}
