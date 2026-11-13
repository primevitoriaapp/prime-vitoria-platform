"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

const REASONS = ["Imprevisto pessoal", "Problema com o carro", "Conflito de horário", "Estou longe do local", "Toquei sem querer em aceitar"];

/** Botão discreto "Não posso fazer" + confirmação com motivo. A corrida volta para a central. */
export function DriverDeclineButton({
  tripId,
  devFallbackRole,
  onDeclined
}: {
  tripId: string;
  devFallbackRole: "motorista" | "admin";
  onDeclined: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finalReason = (reason === "Outro motivo" ? other : reason).trim();

  async function confirm() {
    if (finalReason.length < 3 || busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/driver-decline`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: finalReason }) },
      devFallbackRole
    ).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok && j?.success) {
      setOpen(false);
      onDeclined();
    } else setErr(j?.error?.message ?? "Não foi possível recusar agora. Ligue para a central.");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 w-full py-2 text-center text-sm font-semibold text-red-700 underline">
        Não posso fazer esta corrida
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end bg-black/40" role="dialog" aria-modal="true">
          <button type="button" aria-label="Voltar" className="flex-1" onClick={() => !busy && setOpen(false)} />
          <div className="rounded-t-[28px] bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto max-w-lg">
              <p className="text-lg font-bold text-[#111]">Recusar esta corrida?</p>
              <p className="mt-1 text-sm text-[#6B6F76]">Ela sai da sua agenda e volta para a central escolher outro motorista. A central é avisada na hora.</p>
              <p className="mt-4 text-sm font-semibold text-[#111]">Qual o motivo?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...REASONS, "Outro motivo"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`rounded-full px-3 py-2 text-sm ${reason === r ? "bg-[#111] font-semibold text-prime-gold" : "bg-[#F3F1EC] text-[#111]"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {reason === "Outro motivo" ? (
                <textarea
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  rows={2}
                  placeholder="Conte rapidinho o que aconteceu"
                  className="mt-3 w-full rounded-xl border border-[#E5E1D8] px-3 py-2 text-sm"
                />
              ) : null}
              {err ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{err}</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-2xl border border-[#E5E1D8] py-3.5 text-sm font-semibold text-[#111]">
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={busy || finalReason.length < 3}
                  onClick={() => void confirm()}
                  className="rounded-2xl bg-red-700 py-3.5 text-sm font-bold text-[#fff] disabled:opacity-40"
                >
                  {busy ? "Recusando…" : "Sim, recusar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
