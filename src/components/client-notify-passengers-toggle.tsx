"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Liga/desliga os avisos de WhatsApp aos passageiros desta empresa. */
export function ClientNotifyPassengersToggle({ clientId }: { clientId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sign, setSign] = useState(false);
  const [mode, setMode] = useState<"completo" | "so_a_caminho">("completo");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/clients/${clientId}/notify-passengers`, {}, "admin")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setEnabled(j.data.enabled);
          setSign(j.data.requires_signature === true);
          setMode(j.data.mode === "so_a_caminho" ? "so_a_caminho" : "completo");
        }
      })
      .catch(() => undefined);
  }, [clientId]);
  async function save(patch: { enabled?: boolean; requires_signature?: boolean; mode?: "completo" | "so_a_caminho" }) {
    setBusy(true);
    const r = await fetchWithSupabaseSession(
      `/api/clients/${clientId}/notify-passengers`,
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
      "admin"
    ).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      if (patch.enabled !== undefined) setEnabled(patch.enabled);
      if (patch.requires_signature !== undefined) setSign(patch.requires_signature);
      if (patch.mode) setMode(patch.mode);
    }
  }
  if (enabled === null) return null;
  return (
    <div className="mt-3 grid gap-2">
    <label className="flex items-start gap-3 rounded-2xl border border-prime-border bg-white p-4 text-sm shadow-prime-card">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={sign} disabled={busy} onChange={(e) => void save({ requires_signature: e.target.checked })} />
      <span>
        <span className="font-semibold">Pedir assinatura do passageiro no fim da corrida</span>
        <span className="block text-prime-muted">Só para empresas que exigem comprovante assinado. Desmarcado, o motorista finaliza só com o KM.</span>
      </span>
    </label>
    <label className="flex items-start gap-3 rounded-2xl border border-prime-border bg-white p-4 text-sm shadow-prime-card">
      <input type="checkbox" className="mt-1 h-5 w-5" checked={enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} />
      <span>
        <span className="font-semibold">Avisar os passageiros pelo WhatsApp</span>
        <span className="block text-prime-muted">Motorista confirmado (véspera), a caminho (com link) e pedido de avaliação. Desmarque se esta empresa não quer que os passageiros recebam.</span>
      </span>
    </label>
    {enabled ? (
      <div className="grid gap-2 rounded-2xl border border-prime-border bg-white p-4 text-sm shadow-prime-card">
        <span className="font-semibold">Quais avisos?</span>
        <label className="flex items-start gap-3">
          <input type="radio" name={`nm-${clientId}`} className="mt-1 h-4 w-4" checked={mode === "completo"} disabled={busy} onChange={() => void save({ mode: "completo" })} />
          <span>
            <b>Completo</b> — confirmação na véspera, a caminho e avaliação.
            <span className="block text-prime-muted">Passageiro recorrente já recebe menos: confirmação só quando o motorista muda e avaliação 1 vez por mês.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="radio" name={`nm-${clientId}`} className="mt-1 h-4 w-4" checked={mode === "so_a_caminho"} disabled={busy} onChange={() => void save({ mode: "so_a_caminho" })} />
          <span>
            <b>Rota fixa diária</b> — só o aviso “motorista a caminho”, com o link para acompanhar.
            <span className="block text-prime-muted">Para quem usa todo dia no mesmo horário (ex.: TRT). Sem confirmação na véspera e sem pedido de avaliação.</span>
          </span>
        </label>
      </div>
    ) : null}
    </div>
  );
}
