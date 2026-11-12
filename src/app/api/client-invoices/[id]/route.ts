import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { getClientInvoice, updateClientInvoiceStatus } from "@/lib/finance/client-invoices";

const patchSchema = z.object({
  status: z.enum(["aberta", "enviada", "paga", "cancelada"]).optional(),
  boleto_url: z.string().url().max(2000).nullable().optional(),
  boleto_line: z.string().max(120).nullable().optional(),
  nf_number: z.string().max(40).nullable().optional(),
  nf_url: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payment_method: z.enum(["boleto", "pix", "transferencia", "dinheiro", "outro"]).nullable().optional(),
  charge_method: z.enum(["boleto", "pix"]).nullable().optional(),
  charge_bank_account_id: z.string().uuid().nullable().optional()
});

/** Equipe Prime: marcar enviada/paga/cancelada e anexar boleto (link e linha digitável). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") {
      return fail("FORBIDDEN", "Só admin ou financeiro alteram faturas", 403);
    }
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const current = await getClientInvoice(tenantId, id);
    if (!current) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    const body = patchSchema.parse(await request.json());
    const saved = await updateClientInvoiceStatus(tenantId, id, body);
    const { insertAuditEvent } = await import("@/lib/server/audit-log");
    const action = body.status
      ? `invoice.status_${body.status}`
      : body.due_date
        ? "invoice.due_change"
        : body.nf_number !== undefined
          ? "invoice.nf_number"
          : body.boleto_line !== undefined
            ? "invoice.boleto_line"
            : body.charge_method !== undefined
              ? "invoice.charge_method"
              : "invoice.edit";
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action,
      entityType: "client_invoice",
      entityId: id,
      metadata: {
        ...(body.due_date ? { de: current?.due_date ?? null, para: body.due_date } : {}),
        ...(body.paid_on ? { pago_em: body.paid_on } : {}),
        ...(body.payment_method ? { forma: body.payment_method } : {})
      },
      request
    }).catch(() => undefined);
    return ok(saved);
  } catch (error) {
    return mapApiError(error);
  }
}
