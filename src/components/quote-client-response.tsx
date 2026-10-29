"use client";

import { useState } from "react";

/** No link do orçamento: o cliente aprova com um clique ou pede ajuste. */
export function QuoteClientResponse({ quoteId, token, status, defaultName }: { quoteId: string; token: string; status: string; defaultName: string }) {
  const [mode, setMode] = useState<"idle" | "aprovar" | "ajuste">("idle");
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(status === "aprovado" ? "Este orçamento já está aprovado. Obrigado!" : null);
  const [err, setErr] = useState<string | null>(null);

  async function send(action: "aprovar" | "ajuste") {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/public/quotes/${quoteId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, action, name, message: message || undefined })
    });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { status: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return setErr(j.error?.message ?? "Não foi possível enviar. Tente de novo.");
    setDone(
      action === "ajuste"
        ? "Recebemos seu pedido de ajuste. A Prime Vitória responde em breve."
        : "Orçamento aprovado! Seus serviços estão reservados e você recebe a confirmação com os dados do motorista antes de cada serviço."
    );
  }

  if (done) {
    return <div style={{ margin: "0 26px 18px", padding: 16, borderRadius: 12, background: "#ECFDF5", color: "#065F46", fontSize: 14, fontWeight: 600 }}>{done}</div>;
  }

  const btn = (bg: string, color: string): React.CSSProperties => ({ flex: 1, minWidth: 160, padding: "14px 16px", borderRadius: 12, border: 0, background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer" });
  const input: React.CSSProperties = { width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #DDD5C2", fontSize: 16, boxSizing: "border-box" };

  return (
    <div className="quote-actions" style={{ margin: "0 26px 18px", padding: 16, borderRadius: 14, background: "#FAF7F0", border: "1px solid #EEE9DC" }}>
      {mode === "idle" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={btn("#111", "#C9A84C")} onClick={() => setMode("aprovar")}>
            ✓ Aprovar orçamento
          </button>
          <button type="button" style={btn("#fff", "#111")} onClick={() => setMode("ajuste")}>
            Pedir ajuste
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 13 }}>
            Seu nome
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ fontSize: 13 }}>
            {mode === "aprovar" ? "Observação (opcional): nomes dos passageiros, voo…" : "O que precisa mudar?"}
            <textarea style={{ ...input, minHeight: 80 }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {err ? <p style={{ color: "#B91C1C", fontSize: 13, margin: 0 }}>{err}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy || name.trim().length < 2 || (mode === "ajuste" && message.trim().length < 3)}
              style={{ ...btn("#111", "#C9A84C"), opacity: busy ? 0.6 : 1 }}
              onClick={() => void send(mode)}
            >
              {busy ? "Enviando…" : mode === "aprovar" ? "Confirmar aprovação" : "Enviar pedido de ajuste"}
            </button>
            <button type="button" style={btn("transparent", "#555")} onClick={() => setMode("idle")}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
