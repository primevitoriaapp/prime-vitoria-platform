import type { CSSProperties, ReactNode } from "react";

/** Peças do documento padrão Prime (fatura, voucher, orçamento): mesmo cabeçalho, quadros e tabela. */

export const DOC_GOLD = "#C9A84C";
export const DOC_LABEL: CSSProperties = { fontSize: 10, letterSpacing: ".08em", color: "#7A6A3A", textTransform: "uppercase" };
export const DOC_TH: CSSProperties = {
  textAlign: "left",
  padding: "8px 6px",
  fontSize: 10,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "#7A6A3A",
  borderBottom: `2px solid ${DOC_GOLD}`
};
export const DOC_TD: CSSProperties = { padding: "8px 6px", fontSize: 12, borderBottom: "1px solid #EEE9DC", verticalAlign: "top" };

/** CSS de impressão comum (fundo preto e dourado saem no PDF; linha não quebra no meio). */
export function docPrintCss(root: string, sheet: string, actions: string, page = "A4") {
  return `
    @media print {
      .${root} { background: #fff !important; padding: 0 !important; }
      .${actions} { display: none !important; }
      .${sheet} { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
      .${sheet}, .${sheet} * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .${sheet} tr { break-inside: avoid; }
      @page { size: ${page}; margin: 10mm; }
    }`;
}

/** 12345678000190 → 12.345.678/0001-90 (CPF também). */
export function fmtDoc(raw: string | null | undefined): string {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return String(raw ?? "");
}

export function DocHeader({
  issuerName,
  issuerCnpj,
  contact,
  kind,
  number,
  lines
}: {
  issuerName: string;
  issuerCnpj: string;
  contact?: string | null;
  kind: string;
  number: string;
  lines?: (string | null | undefined | false)[];
}) {
  return (
    <>
      <header style={{ background: "#111", color: "#fff", padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/public/brand-logo" alt="Prime Vitória" style={{ height: 64, width: "auto", objectFit: "contain", borderRadius: 6 }} />
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", color: DOC_GOLD }}>TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{issuerName}</div>
            <div style={{ fontSize: 11, color: "#BBB" }}>CNPJ {fmtDoc(issuerCnpj)}</div>
            {contact ? <div style={{ fontSize: 11, color: "#BBB" }}>{contact}</div> : null}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#BBB" }}>{kind}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: DOC_GOLD }}>{number}</div>
          {(lines ?? []).filter(Boolean).map((l, i) => (
            <div key={i} style={{ fontSize: 12, color: "#DDD" }}>
              {l}
            </div>
          ))}
        </div>
      </header>
      <div style={{ height: 4, background: DOC_GOLD }} />
    </>
  );
}

/** Quadro de informações: rótulo pequeno dourado + valor. */
export function DocInfoGrid({ items }: { items: [string, ReactNode][] }) {
  const list = items.filter(([, v]) => v != null && v !== "" && v !== false);
  return (
    <section style={{ padding: "18px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
      {list.map(([k, v]) => (
        <div key={k}>
          <div style={DOC_LABEL}>{k}</div>
          <div style={{ fontWeight: 600 }}>{v}</div>
        </div>
      ))}
    </section>
  );
}

/** Bloco do cliente (tomador). */
export function DocClientBlock({
  title = "Cliente",
  name,
  tradeName,
  document,
  address,
  email,
  extra
}: {
  title?: string;
  name: string | null | undefined;
  tradeName?: string | null;
  document?: string | null;
  address?: string | null;
  email?: string | null;
  extra?: ReactNode;
}) {
  const docDigits = String(document ?? "").replace(/\D/g, "");
  return (
    <div style={{ minWidth: 0 }}>
      <div style={DOC_LABEL}>{title}</div>
      <div style={{ fontWeight: 700 }}>{name || tradeName || "—"}</div>
      {tradeName && tradeName !== name ? <div style={{ fontSize: 12, color: "#555" }}>{tradeName}</div> : null}
      {document ? (
        <div style={{ fontSize: 12, color: "#555" }}>
          {docDigits.length === 11 ? "CPF" : "CNPJ"} {fmtDoc(document)}
        </div>
      ) : null}
      {address ? <div style={{ fontSize: 12, color: "#555" }}>{address}</div> : null}
      {email ? <div style={{ fontSize: 12, color: "#555" }}>{email}</div> : null}
      {extra}
    </div>
  );
}

export type RoutePoint = { address: string; who?: string | null };

/** Trajeto completo, um ponto por linha: ● embarque → paradas → destino. */
export function DocRoute({ points }: { points: RoutePoint[] }) {
  return (
    <>
      {points.map((p, i) => (
        <div key={i}>
          <span style={{ color: "#7A6A3A", fontWeight: 700 }}>{i === 0 ? "●" : "→"}</span> <span style={{ fontWeight: i === 0 || i === points.length - 1 ? 600 : 400 }}>{p.address}</span>
          {p.who ? <span style={{ color: "#888" }}> · {p.who}</span> : null}
        </div>
      ))}
    </>
  );
}

export function DocSheet({ className, children, maxWidth = 1000 }: { className: string; children: ReactNode; maxWidth?: number }) {
  return (
    <article
      className={className}
      style={{ maxWidth, margin: "0 auto", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.08)", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", color: "#111" }}
    >
      {children}
    </article>
  );
}
