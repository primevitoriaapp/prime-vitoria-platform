import Link from "next/link";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/session";
import { db } from "@/lib/server/db";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { loadQuoteDoc } from "@/lib/quotes/quote-document";
import { QuoteClientResponse } from "@/components/quote-client-response";

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
export default async function OrcamentoPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) return <Message title="Orçamento não encontrado" />;
  // Cliente abre pelo link do e-mail (token); a equipe abre logada.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null;
  let tenantId = DEFAULT_TENANT_ID;
  let viaLink = false;
  if (t && /^[A-Za-z0-9_-]{16,80}$/.test(t)) {
    const { data } = await db.from("quotes").select("*").eq("id", id).eq("share_token", t).maybeSingle();
    q = data;
    if (q) {
      tenantId = q.tenant_id as string;
      viaLink = true;
    }
  }
  if (!q) {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return <Message title="Entre com a conta da Prime para ver o orçamento" />;
    tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
    const { data } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    q = data;
  }
  if (!q) return <Message title="Orçamento não encontrado" />;
  const d = await loadQuoteDoc(q);
  const clientName = d.client.name;
  const pdfHref = `/api/quotes/${id}/pdf${viaLink && t ? `?t=${t}&` : "?"}`;

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#7A6A3A", borderBottom: `2px solid ${GOLD}` };
  const td: React.CSSProperties = { padding: "9px 6px", fontSize: 12, borderBottom: "1px solid #EEE9DC", verticalAlign: "top" };
  const box: React.CSSProperties = { background: "#F8F5EE", border: "1px solid #EAE4D6", borderRadius: 10, padding: "12px 14px", fontSize: 12, color: "#555", lineHeight: 1.5 };
  const label: React.CSSProperties = { fontSize: 10, letterSpacing: ".1em", color: "#8C702C", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 };
  const btn: React.CSSProperties = { borderRadius: 8, padding: "9px 14px", fontWeight: 600, fontSize: 14, textDecoration: "none", display: "inline-block" };

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={`${pdfHref}download=1`} style={{ ...btn, background: "#111", color: GOLD, border: `1px solid ${GOLD}` }}>
            Baixar PDF
          </a>
          <a href={pdfHref.replace(/[?&]$/, "")} target="_blank" rel="noopener noreferrer" style={{ ...btn, background: "#fff", color: "#111", border: "1px solid #CFC7B0" }}>
            Abrir PDF
          </a>
        </div>
      </div>
      <article className="quote-sheet" style={{ maxWidth: 820, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111" }}>
        <header style={{ background: "#111", color: "#fff", padding: "20px 26px", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/public/brand-logo" alt="Prime Vitória" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 12, background: "#fff", objectFit: "cover" }} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.04em" }}>
                PRIME <span style={{ color: GOLD }}>VITÓRIA</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", color: GOLD, marginTop: 2 }}>TRANSPORTE EXECUTIVO</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#BBB" }}>ORÇAMENTO</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{d.number}</div>
            <div style={{ fontSize: 12, color: "#DDD" }}>Emitido em {new Date(d.createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
            {d.validUntil ? <div style={{ fontSize: 12, color: "#DDD" }}>Válido até {brDate(d.validUntil)}</div> : null}
          </div>
        </header>
        <div style={{ height: 4, background: GOLD }} />

        <section style={{ padding: "18px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div style={box}>
            <div style={label}>Empresa</div>
            <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>{d.issuer.tradeName}</div>
            <div>{d.issuer.legalName}</div>
            <div>CNPJ {d.issuer.cnpj}</div>
            {d.issuer.address ? <div>{d.issuer.address}</div> : null}
            {d.issuer.phone ? <div>Tel. {d.issuer.phone}</div> : null}
            {d.issuer.email ? <div>{d.issuer.email}</div> : null}
          </div>
          <div style={box}>
            <div style={label}>Cliente</div>
            <div style={{ fontWeight: 700, color: "#111", fontSize: 14 }}>{d.client.name}</div>
            {d.client.legalName ? <div>{d.client.legalName}</div> : null}
            {d.client.doc ? <div>{d.client.docLabel} {d.client.doc}</div> : null}
            {d.client.address ? <div>{d.client.address}</div> : null}
            {d.client.contact ? <div>A/C {d.client.contact}</div> : null}
            {d.client.phone ? <div>Tel. {d.client.phone}</div> : null}
            {d.client.email ? <div>{d.client.email}</div> : null}
          </div>
        </section>

        <section style={{ padding: "0 26px 10px" }}>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 70 }}>Hora</th>
                <th style={th}>Veículo e serviço</th>
                <th style={th}>Trajeto</th>
                <th style={{ ...th, textAlign: "center" }}>Qtd.</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
              </tr>
            </thead>
            {d.groups.map((g) => (
              <tbody key={g.day || "sem-data"}>
                <tr>
                  <td colSpan={5} style={{ padding: "12px 6px 6px", fontSize: 12, fontWeight: 700, color: "#111", borderBottom: "1px solid #EEE9DC" }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: GOLD, marginRight: 8 }} />
                    {g.title}
                  </td>
                </tr>
                {g.rows.map((r, k) => (
                  <tr key={k}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.time}</td>
                    <td style={td}>
                      <b>{r.vehicle}</b>
                      <div style={{ color: "#555" }}>{[r.service, r.passengers].filter(Boolean).join(" · ")}</div>
                      {r.note ? <div style={{ color: "#555", marginTop: 2 }}>Passageiros: {r.note}</div> : null}
                      {r.detail ? <div style={{ color: "#8C702C", marginTop: 2 }}>Obs.: {r.detail}</div> : null}
                    </td>
                    <td style={td}>
                      {r.from}
                      {r.to ? <div style={{ color: "#555" }}>{r.diaria ? r.to : `→ ${r.to}`}</div> : null}
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>{r.qty}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {brl(r.total)}
                      {r.qty > 1 ? <div style={{ color: "#777", fontSize: 11 }}>{brl(r.unit)} cada</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <table style={{ fontSize: 13 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "3px 12px", color: "#555" }}>Subtotal</td>
                  <td style={{ padding: "3px 0", textAlign: "right" }}>{brl(d.totals.subtotal)}</td>
                </tr>
                {d.totals.discount > 0 ? (
                  <tr>
                    <td style={{ padding: "3px 12px", color: "#555" }}>Desconto</td>
                    <td style={{ padding: "3px 0", textAlign: "right" }}>− {brl(d.totals.discount)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td style={{ padding: "6px 12px", fontWeight: 700 }}>Total</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, fontSize: 16 }}>{brl(d.totals.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {d.notes || d.conditions ? (
          <section style={{ padding: "8px 26px 18px", fontSize: 12, color: "#333", display: "grid", gap: 10 }}>
            {d.notes ? (
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Observações</div>
                <div style={{ whiteSpace: "pre-line" }}>{d.notes}</div>
              </div>
            ) : null}
            {d.conditions ? (
              <div>
                <div style={{ fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" }}>Condições</div>
                <div style={{ whiteSpace: "pre-line" }}>{d.conditions}</div>
              </div>
            ) : null}
          </section>
        ) : null}

        {viaLink && t ? <QuoteClientResponse quoteId={id} token={t} status={q.status as string} defaultName={clientName === "Cliente" ? "" : clientName} /> : null}

        <footer style={{ borderTop: `2px solid ${GOLD}`, padding: "14px 26px 20px", fontSize: 12, color: "#555" }}>
          {viaLink ? "Dúvidas? Fale com a central." : "Para aprovar, responda este orçamento por WhatsApp ou e-mail."} {d.issuer.phone ? `Central: ${d.issuer.phone}. ` : ""}
          {d.issuer.email ? `${d.issuer.email}` : ""}
        </footer>
      </article>
    </main>
  );
}
