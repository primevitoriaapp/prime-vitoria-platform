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
import { InvoiceSheetActions } from "./sheet-actions";
import { loadInvoiceDetail } from "@/lib/finance/invoice-detail";
import { InvoiceOverview } from "@/components/invoice-overview";
import { invoicePixCharge } from "@/lib/finance/invoice-charge";
import { DocHeader, DocRoute } from "@/components/docs/prime-doc";

export const dynamic = "force-dynamic";

const GOLD = "#C9A84C";
const brl = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
/** 12345678000190 → 12.345.678/0001-90 (CPF também). */
function fmtDoc(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return String(raw ?? "");
}
const label: React.CSSProperties = { fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" };

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

  // Primeira vez que o gestor do cliente abre: fica no histórico da fatura.
  if (session.role === "cliente" && !(invoice as { viewed_at?: string | null }).viewed_at) {
    await db.from("client_invoices").update({ viewed_at: new Date().toISOString() }).eq("id", invoice.id).is("viewed_at", null);
  }
  const overview = await loadInvoiceDetail(tenantId, id, { internal: false });
  const pix = await invoicePixCharge(invoice);
  const [rows, { data: client }, company] = await Promise.all([
    buildInvoiceReport(id),
    db.from("clients").select("name, trade_name, document, email, phone, address_line, city, state, postal_code").eq("id", invoice.client_id).maybeSingle(),
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
          .invoice-sheet, .invoice-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .invoice-sheet tr { break-inside: avoid; }
          .invoice-actions { display: none !important; }
          .invoice-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
      {overview ? (
        <div className="invoice-actions" style={{ maxWidth: 1000, margin: "0 auto 20px" }}>
          <InvoiceOverview detail={overview} />
          {pix ? (
            <div style={{ marginTop: 12, background: "#fff", border: "1px solid #E8E4DC", borderRadius: 14, padding: 16, fontFamily: "system-ui, sans-serif" }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>💠 Pagamento por PIX ou transferência</p>
              {pix.pix_key ? (
                <p style={{ margin: "8px 0 0", fontSize: 15 }}>
                  Chave PIX: <b style={{ fontFamily: "monospace" }}>{pix.pix_key}</b>
                </p>
              ) : null}
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#444" }}>
                Favorecido: {pix.holder_name}
                {pix.holder_document ? ` · CNPJ ${pix.holder_document}` : ""}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#444" }}>
                Banco {pix.bank}
                {pix.agency ? ` · Agência ${pix.agency}` : ""}
                {pix.account ? ` · Conta ${pix.account}` : ""}
              </p>
            </div>
          ) : null}
          {overview.invoice.boleto_path || overview.invoice.boleto_line ? (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {overview.invoice.boleto_path ? (
                <a
                  href={`/api/client-invoices/${invoice.id}/files?kind=boleto`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderRadius: 10, padding: "10px 16px", fontWeight: 700, background: "#111", color: "#C9A84C", textDecoration: "none", fontFamily: "system-ui, sans-serif", fontSize: 14 }}
                >
                  ⬇ Baixar boleto
                </a>
              ) : null}
              {overview.invoice.boleto_line ? (
                <span style={{ fontFamily: "monospace", fontSize: 13, background: "#fff", border: "1px solid #E8E4DC", borderRadius: 10, padding: "10px 12px" }}>
                  {overview.invoice.boleto_line}
                </span>
              ) : null}
            </div>
          ) : null}
          <p style={{ marginTop: 16, fontSize: 12, color: "#6B6F76", fontFamily: "system-ui, sans-serif" }}>Relatório detalhado para conferência e impressão abaixo.</p>
        </div>
      ) : null}
      <div className="invoice-actions" style={{ maxWidth: 1000, margin: "0 auto 12px", display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
        <InvoiceSheetActions pdfHref={`/api/client-invoices/${invoice.id}/pdf?download=1`} />
        <a
          href={`/api/client-invoices/${invoice.id}/csv`}
          style={{ borderRadius: 8, padding: "8px 14px", fontWeight: 600, border: "1px solid #CFC7B0", color: "#111", textDecoration: "none", fontFamily: "system-ui, sans-serif", fontSize: 14 }}
        >
          Baixar planilha (Excel)
        </a>
      </div>

      <article className="invoice-sheet" style={{ maxWidth: 1000, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111" }}>
        <DocHeader
          issuerName={issuerName}
          issuerCnpj={issuerCnpj}
          contact={[company.email ?? "contato@primevitoria.com", company.phone].filter(Boolean).join(" · ")}
          kind="FATURA"
          number={num}
          lines={[invoice.client_ref ? `Voucher ${invoice.client_ref}` : null, `${INVOICE_STATUS_LABEL[invoice.status]}${overdue ? " · vencida" : ""}`]}
        />

        <section style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
          <div style={{ gridColumn: "span 2", minWidth: 0 }}>
            <div style={label}>Cliente (tomador)</div>
            <div style={{ fontWeight: 700 }}>{(client?.name as string | null) || (client?.trade_name as string | null)}</div>
            {client?.trade_name && client.trade_name !== client.name ? <div style={{ fontSize: 12, color: "#555" }}>{client.trade_name as string}</div> : null}
            {client?.document ? <div style={{ fontSize: 12, color: "#555" }}>{String(client.document).replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ"} {fmtDoc(client.document as string)}</div> : null}
            {client?.address_line || client?.city ? (
              <div style={{ fontSize: 12, color: "#555" }}>
                {[client?.address_line, [client?.city, client?.state].filter(Boolean).join("/"), client?.postal_code ? `CEP ${client.postal_code}` : null].filter(Boolean).join(" · ")}
              </div>
            ) : null}
            {client?.email ? <div style={{ fontSize: 12, color: "#555" }}>{client.email as string}</div> : null}
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
              {rows.length} serviço{rows.length === 1 ? "" : "s"} · {Number(invoice.total_km).toLocaleString("pt-BR")} km
            </div>
            {overview && overview.prepaid > 0 ? (
              <div style={{ fontSize: 12, color: "#DDD", marginTop: 6, borderTop: "1px solid #333", paddingTop: 6 }}>
                Pago na reserva: {brl(overview.prepaid)}
                <div style={{ fontWeight: 700, color: "#fff" }}>Saldo a pagar: {brl(Math.max(0, Number(invoice.total_amount) - overview.prepaid))}</div>
              </div>
            ) : null}
          </div>
        </section>

        {invoice.nf_number ? (
          <p style={{ margin: "0 24px 12px", fontSize: 13 }}>
            <b>Nota fiscal:</b> nº {invoice.nf_number}
            {invoice.nf_url ? (
              <>
                {" · "}
                <a href={invoice.nf_url} target="_blank" rel="noopener noreferrer" className="invoice-actions" style={{ color: "#111", fontWeight: 600 }}>
                  abrir PDF
                </a>
              </>
            ) : null}
          </p>
        ) : null}
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
                <th style={th}>Trajeto (embarque → paradas → destino)</th>
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
                    <div style={{ fontSize: 10, color: "#888" }}>{r.ref ?? `Nº ${r.number}`}</div>
                  </td>
                  <td style={td}>
                    {r.passenger}
                    {r.cost_center ? <div style={{ fontSize: 10, color: "#888" }}>{r.cost_center}</div> : null}
                  </td>
                  <td style={td}>{r.requester ?? "—"}</td>
                  <td style={td}>
                    <DocRoute
                      points={[
                        { address: shortAddress(r.origin) },
                        ...r.stops.map((st) => ({ address: shortAddress(st.address), who: st.passenger })),
                        { address: shortAddress(r.destination) }
                      ]}
                    />
                    {r.flight ? <div style={{ fontSize: 10, color: "#888" }}>Voo {r.flight}</div> : null}
                    {r.wait_charge ? (
                      <div style={{ fontSize: 11, color: "#8A5A00", marginTop: 4, background: "#FFF4D6", borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>
                        + Hora extra / espera: {r.wait_charge.billable_minutes} min · {brl(r.wait_charge.amount)}
                      </div>
                    ) : r.wait_minutes > 0 ? (
                      <div style={{ fontSize: 10, color: "#888" }}>Espera {r.wait_minutes} min (dentro da tolerância)</div>
                    ) : null}
                  </td>
                  <td style={td}>{r.service}</td>
                  <td style={{ ...td, textAlign: "right" }}>{r.km ? r.km.toLocaleString("pt-BR") : "—"}</td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
                    {brl(r.amount)}
                    {r.wait_charge && r.amount != null ? (
                      <div style={{ fontSize: 10, fontWeight: 400, color: "#666", whiteSpace: "nowrap" }}>
                        corrida {brl(Math.round((r.amount - r.wait_charge.amount) * 100) / 100)}
                        <br />+ hora extra {brl(r.wait_charge.amount)}
                      </div>
                    ) : null}
                  </td>
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
