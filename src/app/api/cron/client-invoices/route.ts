import { fail, ok } from "@/lib/server/http";
import { db } from "@/lib/server/db";
import { isCronSecretAuthorized } from "@/lib/security/cron-auth";
import { closingPeriodEndingYesterday, saoPauloToday } from "@/lib/finance/client-invoice-calc";
import { generateClientInvoices, type GenerateResult } from "@/lib/finance/client-invoices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron diário (06h de Brasília): fecha as faturas dos clientes cujo período terminou ontem.
 * Mês cheio fecha no dia 1º; dia fixo (ex.: 15) fecha no dia 16.
 */
export async function GET(request: Request) {
  if (!isCronSecretAuthorized(request)) return fail("UNAUTHORIZED", "Cron não autorizado", 401);
  try {
    const today = saoPauloToday();
    const { data: clients, error } = await db
      .from("clients")
      .select("id, tenant_id, invoice_closing_day")
      .eq("active", true)
      .eq("invoice_auto_close", true)
      .eq("invoiced", true)
      .limit(2000);
    if (error) return fail("CRON_CLIENTS_FAILED", error.message, 500);

    const results: (GenerateResult & { period: string })[] = [];
    for (const c of clients ?? []) {
      const period = closingPeriodEndingYesterday(Number(c.invoice_closing_day) || 0, today);
      if (!period) continue;
      const r = await generateClientInvoices({
        tenantId: c.tenant_id as string,
        periodStart: period.start,
        periodEnd: period.end,
        clientId: c.id as string
      });
      for (const item of r) results.push({ ...item, period: `${period.start}..${period.end}` });
    }
    return ok({ cron: "client-invoices", today, invoices: results.filter((r) => r.invoice_id).length, results });
  } catch (error) {
    return fail("CRON_CLIENT_INVOICES_FAILED", error instanceof Error ? error.message : String(error), 500);
  }
}
