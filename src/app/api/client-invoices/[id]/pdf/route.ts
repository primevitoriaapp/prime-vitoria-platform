import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getClientInvoice } from "@/lib/finance/client-invoices";
import { canViewClientInvoice } from "@/lib/finance/client-invoice-access";
import { invoicePdfFor } from "@/lib/finance/invoice-pdf-data";

export const runtime = "nodejs";

/** Fatura detalhada em PDF (mesmo arquivo que vai anexo no e-mail). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role === "guest") return fail("UNAUTHORIZED", "Entre para baixar a fatura", 401);
    const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
    const { id } = await params;
    const invoice = await getClientInvoice(tenantId, id);
    if (!invoice || !canViewClientInvoice(session, invoice)) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    const pdf = await invoicePdfFor(tenantId, id);
    if (!pdf) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    return new Response(Buffer.from(pdf.bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${pdf.filename.normalize("NFD").replace(/[^\x20-\x7E]/g, "")}"`, "Cache-Control": "no-store" }
    });
  } catch (e) {
    return mapApiError(e);
  }
}
