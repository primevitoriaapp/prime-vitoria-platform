"use client";

const base = { borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif", fontSize: 14, textDecoration: "none" } as const;

/** Voltar, baixar o PDF pronto (o mesmo que vai anexo no e-mail) e imprimir a página. */
export function InvoiceSheetActions({ pdfHref }: { pdfHref: string }) {
  return (
    <>
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/client"))}
        style={{ ...base, background: "transparent", color: "#111", border: "1px solid #CFC7B0" }}
      >
        ← Voltar
      </button>
      <a href={pdfHref} style={{ ...base, background: "#111", color: "#C9A84C", border: "1px solid #C9A84C", marginLeft: "auto" }}>
        ⬇ Baixar PDF da fatura
      </a>
      <button type="button" onClick={() => window.print()} style={{ ...base, background: "transparent", color: "#111", border: "1px solid #CFC7B0" }}>
        Imprimir
      </button>
    </>
  );
}
