"use client";

export function VoucherPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        background: "#111",
        color: "#C9A84C",
        border: "1px solid #C9A84C",
        borderRadius: 8,
        padding: "8px 14px",
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      Baixar PDF / imprimir
    </button>
  );
}
