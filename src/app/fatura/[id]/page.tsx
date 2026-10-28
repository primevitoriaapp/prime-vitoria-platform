import Link from "next/link";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { getClientInvoice } from "@/lib/finance/client-invoices";
import { canViewClientInvoice, isFinanceStaff } from "@/lib/finance/client-invoice-access";
import { buildInvoiceReport } from "@/lib/finance/client-invoice-report";
import { INVOICE_STATUS_LABEL, formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { shortAddress } from "@/lib/client/short-address";
import { VoucherPrintButton } from "@/app/voucher/[id]/print-button";

export const dynamic = "force-dynamic";

const GOLD = "#C9A84C";
const brl = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
      <p style={{ color: "#555" }}>{text}</p>
      <p>
        <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}

/** Fatura do cliente com relatório completo das corridas. Vira PDF pelo botão de imprimir. */
export default async function FaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <Message title="Fatura não encontrada" text="Endereço inválido." />;
  const session = await getSessionContext();
  if (session.role === "guest") return <Message title="Entre para ver a fatura" text="A fatura só abre com login." />;
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const invoice = await getClientInvoice(tenantId, id);
  if (!invoice || !canViewClientInvoice(session, invoice)) {
    return <Message title="Fatura não encontrada" text="Esta fatura não existe ou não está disponível para a sua conta." />;
  }

  const [rows, { data: client }, company] = await Promise.all([
    buildInvoiceReport(id),
    db.from("clients").select("name, trade_name, document, address_line, city, state").eq("id", invoice.client_id).maybeSingle(),
    getTenantCompanyProfile(tenantId)
  ]);
  const issuer = billingIssuerById(invoice.billing_issuer);
  const issuerName = issuer?.legal_name ?? company.legal_name;
  const issuerCnpj = issuer?.cnpj ?? company.cnpj;
  const num = formatInvoiceNumber(invoice.number);
  const staff = isFinanceStaff(session);
  const overdue = invoice.status !== "paga" && invoice.due_date < new Date().toISOString().slice(0, 10);

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#7A6A3A", borderBottom: `2px solid ${GOLD}` };
  const td: React.CSSProperties = { padding: "7px 6px", fontSize: 12, borderBottom: "1px solid #EEE9DC", verticalAlign: "top" };

  return (
    <main style={{ background: "#F4F1EA", minHeight: "100vh", padding: "24px 12px" }} className="invoice-root">
      <style>{`
        @media print {
          .invoice-root { background: #fff !important; padding: 0 !important; }
          .invoice-actions { display: none !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
      <div className="invoice-actions" style={{ maxWidth: 1000, margin: "0 auto 12px", display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <VoucherPrintButton />
        <a
          href={`/api/client-invoices/${invoice.id}/csv`}
          style={{ borderRadius: 8, padding: "8px 14px", fontWeight: 600, border: "1px solid #CFC7B0", color: "#111", textDecoration: "none", fontFamily: "system-ui, sans-serif", fontSize: 14 }}
        >
          Baixar planilha (Excel)
        </a>
      </div>

      <article className="invoice-sheet" style={{ maxWidth: 1000, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111" }}>
        <header style={{ background: "#111", color: "#fff", padding: "20px 24px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>
              PRIME <span style={{ color: GOLD }}>VITÓRIA</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", color: GOLD, marginTop: 2 }}>TRANSPORTE EXECUTIVO</div>
            <div style={{ fontSize: 11, color: "#BBB", marginTop: 8 }}>
              {issuerName} · CNPJ {issuerCnpj}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#BBB" }}>FATURA</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{num}</div>
            <div style={{ fontSize: 12, color: "#DDD" }}>{INVOICE_STATUS_LABEL[invoice.status]}{overdue ? " · vencida" : ""}</div>
          </div>
        </header>
        <div style={{ height: 4, background: GOLD }} />

        <section style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Cliente</div>
            <div style={{ fontWeight: 600 }}>{(client?.trade_name as string | null) || (client?.name as string | null)}</div>
            {client?.document ? <div style={{ fontSize: 12, color: "#555" }}>CNPJ {client.document as string}</div> : null}
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Período</div>
            <div style={{ fontWeight: 600 }}>{brDate(invoice.period_start)} a {brDate(invoice.period_end)}</div>
            <div style={{ fontSize: 12, color: "#555" }}>Emitida em {brDate(invoice.issue_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Vencimento</div>
            <div style={{ fontWeight: 600, color: overdue ? "#B91C1C" : "#111" }}>{brDate(invoice.due_date)}</div>
          </div>
          <div style={{ background: "#111", color: "#fff", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#BBB", textTransform: "uppercase" }}>Total</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{brl(invoice.total_amount)}</div>
            <div style={{ fontSize: 11, color: "#BBB" }}>
              {invoice.trip_count} corrida{invoice.trip_count === 1 ? "" : "s"} · {Number(invoice.total_km).toLocaleString("pt-BR")} km
            </div>
          </div>
        </section>

        {invoice.boleto_url || invoice.boleto_line ? (
          <section style={{ margin: "0 24px 12px", padding: 14, border: `1px dashed ${GOLD}`, borderRadius: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Boleto</div>
            {invoice.boleto_line ? <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 4, wordBreak: "break-all" }}>{invoice.boleto_line}</div> : null}
            {invoice.boleto_url ? (
              <a href={invoice.boleto_url} target="_blank" rel="noopener noreferrer" className="invoice-actions" style={{ display: "inline-block", marginTop: 8, color: "#111", fontWeight: 600 }}>
                Abrir boleto →
              </a>
            ) : null}
          </section>
        ) : invoice.status !== "paga" ? (
          <p style={{ margin: "0 24px 12px", fontSize: 12, color: "#555" }}>
            Dados para pagamento enviados pela central Prime Vitória. Dúvidas: {company.email ?? "contato@primevitoria.com"}
            {company.phone ? ` · ${company.phone}` : ""}.
          </p>
        ) : null}

        <section style={{ padding: "4px 24px 24px", overflowX: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: "6px 0 8px" }}>Relatório das corridas</div>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Passageiro</th>
                <th style={th}>Pedido por</th>
                <th style={th}>De → Para</th>
                <th style={th}>Serviço</th>
                <th style={{ ...th, textAlign: "right" }}>KM</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {r.when}
                    <div style={{ fontSize: 10, color: "#888" }}>Nº {r.number}</div>
                  </td>
                  <td style={td}>
                    {r.passenger}
                    {r.cost_center ? <div style={{ fontSize: 10, color: "#888" }}>{r.cost_center}</div> : null}
                  </td>
                  <td style={td}>{r.requester ?? "—"}</td>
                  <td style={td}>
                    {shortAddress(r.origin)} → {shortAddress(r.destination)}
                    {r.flight ? <div style={{ fontSize: 10, color: "#888" }}>Voo {r.flight}</div> : null}
                    {r.wait_minutes > 0 ? <div style={{ fontSize: 10, color: "#888" }}>Espera {r.wait_minutes} min</div> : null}
                  </td>
                  <td style={td}>{r.service}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.km ? r.km.toLocaleString("pt-BR") : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{brl(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={5}>
                  Total
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{Number(invoice.total_km).toLocaleString("pt-BR")}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{brl(invoice.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
          {staff && rows.some((r) => r.amount == null) ? (
            <p className="invoice-actions" style={{ color: "#B45309", fontSize: 12, marginTop: 8 }}>
              Atenção (só a equipe Prime vê): há corridas sem valor fechado nesta fatura.
            </p>
          ) : null}
        </section>
      </article>
    </main>
  );
}
