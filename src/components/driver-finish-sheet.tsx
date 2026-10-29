"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip } from "@/lib/domain/types";
import { odometerDistance, parseOdometer } from "@/lib/trips/odometer";
import { DriverSignaturePad } from "@/components/driver-signature-pad";

type Extra = { odometer_start?: string; odometer_end?: string };
type SigState = { required: boolean; done: boolean };

const SKIP_REASONS = ["Passageiro com pressa", "Passageiro recusou", "Passageiro não estava apto", "Corrida sem passageiro (só entrega/retirada)"];

/**
 * Tela do motorista para iniciar (KM inicial do painel) ou finalizar (KM final + assinatura do passageiro em
 * corridas de empresa, ou o motivo de não ter assinado).
 */
export function DriverFinishSheet({
  trip,
  mode,
  devFallbackRole,
  busy,
  externalError,
  onCancel,
  onConfirm
}: {
  trip: Trip;
  mode: "start" | "finish";
  devFallbackRole: "motorista" | "admin";
  busy: boolean;
  externalError?: string | null;
  onCancel: () => void;
  onConfirm: (extra: Extra) => void;
}) {
  const [km, setKm] = useState("");
  const [sig, setSig] = useState<SigState | null>(mode === "finish" ? null : { required: false, done: true });
  const [signer, setSigner] = useState(trip.passenger_name ?? "");
  const [image, setImage] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "finish") return;
    let off = false;
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${trip.id}/signature`, {}, devFallbackRole);
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { required: boolean; signature: unknown } };
      if (off) return;
      setSig({ required: Boolean(j.data?.required), done: Boolean(j.data?.signature) });
    })();
    return () => {
      off = true;
    };
  }, [mode, trip.id, devFallbackRole]);

  const value = parseOdometer(km);
  const dist = mode === "finish" && trip.odometer_start != null ? odometerDistance(Number(trip.odometer_start), value) : null;
  const kmOk = mode === "start" ? value != null : dist?.ok === true;
  const sigOk = !sig ? false : !sig.required || sig.done;

  async function saveSignature() {
    setSaving(true);
    setErr(null);
    const body = skip ? { skipped_reason: reason.trim() } : { signer_name: signer.trim(), image_data: image };
    const res = await fetchWithSupabaseSession(
      `/api/trips/${trip.id}/signature`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      devFallbackRole
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setSaving(false);
    if (!res.ok || !j.success) {
      setErr(j.error?.message ?? "Não foi possível salvar. Tente de novo.");
      return;
    }
    setSig((s) => (s ? { ...s, done: true } : s));
  }

  const canSaveSig = skip ? reason.trim().length >= 3 : signer.trim().length >= 2 && Boolean(image);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-[#1F1F22] p-5 text-[#F5F5F5] shadow-2xl sm:rounded-3xl">
        <h2 className="text-lg font-semibold">{mode === "start" ? "Iniciar corrida" : "Finalizar corrida"}</h2>
        <p className="mt-1 text-sm text-[#AAAAAA]">{trip.passenger_name ?? "Passageiro"}</p>

        <label className="mt-4 block text-sm font-semibold">
          {mode === "start" ? "KM do painel agora (inicial)" : "KM do painel agora (final)"}
          <input
            inputMode="decimal"
            autoFocus
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="Ex.: 45.230"
            className="mt-1 w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-4 py-3 text-2xl font-bold tracking-wide text-[#fff] outline-none focus:border-[#C9A84C]"
          />
        </label>
        {mode === "finish" && trip.odometer_start != null ? (
          <p className={`mt-2 text-sm ${dist?.ok ? "text-emerald-300" : "text-[#AAAAAA]"}`}>
            KM inicial: {Number(trip.odometer_start).toLocaleString("pt-BR")}
            {dist?.ok ? ` · percorrido: ${dist.km.toLocaleString("pt-BR")} km` : value != null && dist && !dist.ok ? ` · ${dist.message}` : ""}
          </p>
        ) : null}

        {mode === "finish" && sig?.required ? (
          <div className="mt-5 rounded-2xl border border-[#3A3A3E] p-4">
            <p className="text-sm font-semibold">Assinatura do passageiro</p>
            {sig.done ? (
              <p className="mt-2 text-sm text-emerald-300">Registrado. Pode finalizar.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-[#AAAAAA]">Corrida de empresa: a assinatura documenta que o serviço foi feito.</p>
                {!skip ? (
                  <div className="mt-3 space-y-3">
                    <input
                      value={signer}
                      onChange={(e) => setSigner(e.target.value)}
                      placeholder="Nome de quem assina"
                      className="w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2 text-sm text-[#fff]"
                    />
                    <DriverSignaturePad onChange={setImage} />
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {SKIP_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReason(r)}
                          className={`rounded-full px-3 py-1 text-xs ring-1 ${reason === r ? "bg-[#C9A84C] text-[#111] ring-[#C9A84C]" : "ring-[#3A3A3E]"}`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Por que não assinou?"
                      className="w-full rounded-xl border border-[#3A3A3E] bg-[#111] px-3 py-2 text-sm text-[#fff]"
                    />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button type="button" className="text-xs font-semibold text-[#C9A84C]" onClick={() => setSkip((v) => !v)}>
                    {skip ? "Voltar para assinatura" : "Passageiro não assinou"}
                  </button>
                  <button
                    type="button"
                    disabled={!canSaveSig || saving}
                    onClick={() => void saveSignature()}
                    className="rounded-xl bg-[#C9A84C] px-4 py-2 text-sm font-semibold text-[#111] disabled:opacity-40"
                  >
                    {saving ? "Salvando…" : skip ? "Salvar motivo" : "Salvar assinatura"}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {err || externalError ? <p className="mt-3 text-sm text-red-300">{err ?? externalError}</p> : null}

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[#3A3A3E] px-4 py-3 text-sm">
            Voltar
          </button>
          <button
            type="button"
            disabled={!kmOk || !sigOk || busy}
            onClick={() => onConfirm(mode === "start" ? { odometer_start: km } : { odometer_end: km })}
            className="btn-primary flex-[2] rounded-xl px-4 py-3 text-base font-semibold disabled:opacity-40"
          >
            {busy ? "Processando…" : mode === "start" ? "Iniciar viagem" : "Finalizar corrida"}
          </button>
        </div>
        {mode === "finish" && !sig ? <p className="mt-2 text-center text-xs text-[#AAAAAA]">Verificando assinatura…</p> : null}
      </div>
    </div>
  );
}
