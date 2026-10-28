import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { getClientInvoice } from "@/lib/finance/client-invoices";
import { canViewClientInvoice } from "@/lib/finance/client-invoice-access";
import { buildInvoiceReport, invoiceReportCsv } from "@/lib/finance/client-invoice-report";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

/** Planilha da fatura (Excel). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const invoice = await getClientInvoice(tenantId, id);
    if (!invoice || !canViewClientInvoice(session, invoice)) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    const csv = invoiceReportCsv(await buildInvoiceReport(id));
    const filename = `${formatInvoiceNumber(invoice.number)}-${invoice.period_start.slice(0, 7)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return mapApiError(error);
  }
}
