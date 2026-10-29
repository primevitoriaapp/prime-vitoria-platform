import Link from "next/link";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { billingIssuerById } from "@/lib/clients/billing-terms-calc";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";
import { formatQuoteNumber, quoteTotals } from "@/lib/quotes/quote-calc";
import { SERVICE_MODE_LABEL, type ServiceMode } from "@/lib/pricing/category-catalog";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { shortAddress } from "@/lib/client/short-address";
import { VoucherPrintButton } from "@/app/voucher/[id]/print-button";

export const dynamic = "force-dynamic";

const GOLD = "#C9A84C";
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");

function Message({ title }: { title: string }) {
  return (
    <main style={{ maxWidth: 520, margin: "48px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>{title}</h1>
      <p>
        <Link href="/login">Entrar</Link>
      </p>
    </main>
  );
}

/** Orçamento no padrão preto e dourado da Prime. Vira PDF pelo botão de imprimir. */
export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return <Message title="Orçamento não encontrado" />;
  const session = await getSessionContext();
  if (!["admin", "operador", "financeiro"].includes(session.role)) return <Message title="Entre com a conta da Prime para ver o orçamento" />;
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const { data: q } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!q) return <Message title="Orçamento não encontrado" />;
  const [{ data: items }, client, company] = await Promise.all([
    db.from("quote_items").select("*").eq("quote_id", id).order("position"),
    q.client_id ? db.from("clients").select("name, trade_name, document, email, phone").eq("id", q.client_id).maybeSingle() : Promise.resolve({ data: null }),
    getTenantCompanyProfile(tenantId)
  ]);
  const catIds = [...new Set((items ?? []).map((i) => i.vehicle_category_id as string).filter(Boolean))];
  const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("id, name, passengers").in("id", catIds) : { data: [] };
  const catName = new Map((cats ?? []).map((c) => [c.id as string, `${c.name as string}`]));
  const issuer = billingIssuerById(q.issuer as string | null);
  const totals = quoteTotals((items ?? []).map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), Number(q.discount) || 0);
  const c = client.data as Record<string, string | null> | null;
  const clientName = c?.trade_name || c?.name || (q.contact_name as string) || "Cliente";
  const doc = c?.document || (q.contact_document as string | null);

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#7A6A3A", borderBottom: `2px solid ${GOLD}` };
  const td: React.CSSProperties = { padding: "9px 6px", fontSize: 12, borderBottom: "1px solid #EEE9DC", verticalAlign: "top" };

  return (
    <main style={{ background: "#F4F1EA", minHeight: "100vh", padding: "24px 12px" }} className="quote-root">
      <style>{`
        @media print {
          .quote-root { background: #fff !important; padding: 0 !important; }
          .quote-actions { display: none !important; }
          .quote-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>
      <div className="quote-actions" style={{ maxWidth: 820, margin: "0 auto 12px" }}>
        <VoucherPrintButton />
      </div>
      <article className="quote-sheet" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111" }}>
        <header style={{ background: "#111", color: "#fff", padding: "22px 26px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.04em" }}>
              PRIME <span style={{ color: GOLD }}>VITÓRIA</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", color: GOLD, marginTop: 2 }}>TRANSPORTE EXECUTIVO</div>
            <div style={{ fontSize: 11, color: "#BBB", marginTop: 8 }}>
              {issuer?.legal_name ?? company.legal_name} · CNPJ {issuer?.cnpj ?? company.cnpj}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#BBB" }}>ORÇAMENTO</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{formatQuoteNumber(q.number as number)}</div>
            <div style={{ fontSize: 12, color: "#DDD" }}>Emitido em {new Date(q.created_at as string).toLocaleDateString("pt-BR")}</div>
          </div>
        </header>
        <div style={{ height: 4, background: GOLD }} />

        <section style={{ padding: "18px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Para</div>
            <div style={{ fontWeight: 600 }}>{clientName}</div>
            {doc ? <div style={{ fontSize: 12, color: "#555" }}>{String(doc).replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"} {doc}</div> : null}
            {c?.email || q.contact_email ? <div style={{ fontSize: 12, color: "#555" }}>{c?.email || (q.contact_email as string)}</div> : null}
          </div>
          {q.valid_until ? (
            <div>
              <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Válido até</div>
              <div style={{ fontWeight: 600 }}>{brDate(q.valid_until as string)}</div>
            </div>
          ) : null}
          <div style={{ background: "#111", color: "#fff", borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#BBB", textTransform: "uppercase" }}>Total</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: GOLD }}>{brl(totals.total)}</div>
            <div style={{ fontSize: 11, color: "#BBB" }}>{totals.trips} veículo(s)</div>
          </div>
        </section>

        <section style={{ padding: "0 26px 10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Serviço</th>
                <th style={th}>Data</th>
                <th style={th}>Trajeto</th>
                <th style={{ ...th, textAlign: "center" }}>Qtd.</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((i) => (
                <tr key={i.id as string}>
                  <td style={td}>
                    <b>{catName.get(i.vehicle_category_id as string) ?? "Veículo"}</b>
                    <div style={{ color: "#555" }}>
                      {i.service_mode === "outro" ? "" : SERVICE_MODE_LABEL[i.service_mode as ServiceMode]}
                      {i.passenger_count ? ` · ${i.passenger_count} pessoa(s)` : ""}
                    </div>
                    {i.description ? <div style={{ color: "#555", marginTop: 2 }}>{i.description as string}</div> : null}
                  </td>
                  <td style={td}>{i.scheduled_at ? formatBrDateTime(i.scheduled_at as string) : "A combinar"}</td>
                  <td style={td}>
                    {i.origin_text ? shortAddress(i.origin_text as string) : "—"}
                    <div style={{ color: "#555" }}>→ {i.destination_text ? shortAddress(i.destination_text as string) : "—"}</div>
                  </td>
                  <td style={{ ...td, textAlign: "center" }}>{i.quantity as number}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    {brl(Number(i.unit_price) * Number(i.quantity))}
                    {Number(i.quantity) > 1 ? <div style={{ color: "#777", fontSize: 11 }}>{brl(Number(i.unit_price))} cada</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <table style={{ fontSize: 13 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "3px 12px", color: "#555" }}>Subtotal</td>
                  <td style={{ padding: "3px 0", textAlign: "right" }}>{brl(totals.subtotal)}</td>
                </tr>
                {totals.discount > 0 ? (
                  <tr>
                    <td style={{ padding: "3px 12px", color: "#555" }}>Desconto</td>
                    <td style={{ padding: "3px 0", textAlign: "right" }}>− {brl(totals.discount)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={{ padding: "6px 12px", fontWeight: 700 }}>Total</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontSize: 16 }}>{brl(totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {q.notes || q.conditions ? (
          <section style={{ padding: "8px 26px 18px", fontSize: 12, color: "#333", display: "grid", gap: 10 }}>
            {q.notes ? (
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Observações</div>
                <div style={{ whiteSpace: "pre-line" }}>{q.notes as string}</div>
              </div>
            ) : null}
            {q.conditions ? (
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Condições</div>
                <div style={{ whiteSpace: "pre-line" }}>{q.conditions as string}</div>
              </div>
            ) : null}
          </section>
        ) : null}

        <footer style={{ borderTop: `2px solid ${GOLD}`, padding: "14px 26px 20px", fontSize: 12, color: "#555" }}>
          Para aprovar, responda este orçamento por WhatsApp ou e-mail. {company.phone ? `Central: ${company.phone}. ` : ""}
          {company.email ? `${company.email}` : ""}
        </footer>
      </article>
    </main>
  );
}
