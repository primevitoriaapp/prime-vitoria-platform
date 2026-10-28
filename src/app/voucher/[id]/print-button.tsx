"use client";

const base = {
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 600,
  cursor: "pointer"
} as const;

export function VoucherPrintButton() {
  return (
    <>
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/client"))}
        style={{ ...base, background: "transparent", color: "#111", border: "1px solid #CFC7B0" }}
      >
        ← Voltar
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ ...base, background: "#111", color: "#C9A84C", border: "1px solid #C9A84C" }}
      >
        Baixar PDF / imprimir
      </button>
    </>
  );
}
