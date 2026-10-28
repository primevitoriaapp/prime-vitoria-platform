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
  notes: z.string().max(1000).nullable().optional()
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
    return ok(await updateClientInvoiceStatus(tenantId, id, body));
  } catch (error) {
    return mapApiError(error);
  }
}
