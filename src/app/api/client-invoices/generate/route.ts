import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { generateClientInvoices } from "@/lib/finance/client-invoices";
import { previousMonthPeriod } from "@/lib/finance/client-invoice-calc";

const bodySchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  client_id: z.string().uuid().optional()
});

/** Fecha o período (padrão: mês anterior) e gera as faturas dos clientes. */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") {
      return fail("FORBIDDEN", "Só admin ou financeiro geram faturas", 403);
    }
    const tenantId = assertTenantScope(session);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const prev = previousMonthPeriod();
    const periodStart = body.period_start ?? prev.start;
    const periodEnd = body.period_end ?? prev.end;
    if (periodEnd < periodStart) return fail("INVALID_PERIOD", "O fim do período é antes do início", 400);
    const results = await generateClientInvoices({
      tenantId,
      periodStart,
      periodEnd,
      clientId: body.client_id,
      createdBy: session.userId
    });
    return ok({ period_start: periodStart, period_end: periodEnd, results });
  } catch (error) {
    return mapApiError(error);
  }
}
