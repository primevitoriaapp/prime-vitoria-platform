import { db } from "@/lib/server/db";
import { getClientInvoice } from "@/lib/finance/client-invoices";
import { buildInvoiceReport } from "@/lib/finance/client-invoice-report";
import { INVOICE_STATUS_LABEL, formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { prepaidByTrip } from "@/lib/finance/booking-payments";
import { loadLogoBytes } from "@/lib/quotes/quote-document";
import { shortAddress } from "@/lib/client/short-address";
import { buildInvoicePdf } from "@/lib/finance/invoice-pdf";

const brDate = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");

/** Gera o PDF da fatura detalhada (para anexar no e-mail ou baixar). */
export async function invoicePdfFor(tenantId: string, id: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const invoice = await getClientInvoice(tenantId, id);
  if (!invoice) return null;
  const inv = invoice as typeof invoice & { client_ref?: string | null };
  const [rows, { data: client }, company] = await Promise.all([
    buildInvoiceReport(id),
    db.from("clients").select("name, trade_name, document, email, address_line, city, state, postal_code").eq("id", invoice.client_id).maybeSingle(),
    getTenantCompanyProfile(tenantId)
  ]);
  const issuer = billingIssuerById(invoice.billing_issuer);
  const allIds = rows.flatMap((r) => r.trip_ids ?? [r.id]);
  const pre = await prepaidByTrip(tenantId, allIds).catch(() => new Map<string, number>());
  const prepaid = Math.round(allIds.reduce((s, id) => s + (pre.get(id) ?? 0), 0) * 100) / 100;
  const logo = await loadLogoBytes(company.logo_storage_path ?? null).catch(() => null);
  const num = formatInvoiceNumber(invoice.number);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const overdue = invoice.status !== "paga" && invoice.status !== "cancelada" && invoice.due_date < today;
  const address = [client?.address_line, [client?.city, client?.state].filter(Boolean).join("/"), client?.postal_code ? `CEP ${client.postal_code}` : null]
    .filter(Boolean)
    .join(" · ");

  const bytes = buildInvoicePdf({
    number: num,
    status: `${INVOICE_STATUS_LABEL[invoice.status]}${overdue ? " · vencida" : ""}`,
    voucherRef: inv.client_ref ?? null,
    issuer: {
      name: issuer?.legal_name ?? company.legal_name,
      cnpj: issuer?.cnpj ?? company.cnpj,
      contact: [company.email ?? "contato@primevitoria.com", company.phone].filter(Boolean).join(" · ")
    },
    client: {
      name: ((client?.name as string | null) || (client?.trade_name as string | null) || "Cliente").trim(),
      tradeName: (client?.trade_name as string | null) ?? null,
      document: (client?.document as string | null) ?? null,
      address: address || null,
      email: (client?.email as string | null) ?? null
    },
    period: invoice.period_start === invoice.period_end ? brDate(invoice.period_start) : `${brDate(invoice.period_start)} a ${brDate(invoice.period_end)}`,
    issueDate: brDate(invoice.issue_date || invoice.created_at),
    dueDate: brDate(invoice.due_date),
    total: Number(invoice.total_amount) || 0,
    totalKm: Number(invoice.total_km) || 0,
    tripCount: rows.length,
    prepaid,
    boletoLine: invoice.boleto_line ?? null,
    nfNumber: invoice.nf_number ?? null,
    logo,
    rows: rows.map((r) => ({
      when: r.when,
      ref: r.ref ?? `Nº ${r.number}`,
      passenger: r.passenger,
      requester: r.requester,
      route: [
        { address: shortAddress(r.origin) || r.origin },
        ...r.stops.map((s) => ({ address: shortAddress(s.address) || s.address, who: s.passenger })),
        { address: shortAddress(r.destination) || r.destination }
      ],
      extra: [r.flight ? `Voo ${r.flight}` : null, r.wait_minutes > 0 ? `Espera ${r.wait_minutes} min` : null].filter(Boolean).join(" · ") || null,
      service: r.service,
      km: r.km || null,
      amount: r.amount,
      waitCharge: r.wait_charge ? { billable_minutes: r.wait_charge.billable_minutes, amount: r.wait_charge.amount } : null
    }))
  });
  const ref = inv.client_ref ? `-${inv.client_ref.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_")}` : "";
  return { bytes, filename: `Fatura-${num}${ref}.pdf` };
}
