"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Proof = {
  required: boolean;
  signature: { signer_name: string | null; image_data: string | null; skipped_reason: string | null; created_at: string } | null;
  odometer_start: number | null;
  odometer_end: number | null;
  actual_km: number | null;
  km_source: string | null;
  rating: { stars: number; comment: string | null } | null;
};

const n = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));

/** Agenda → detalhe da corrida: KM do painel e assinatura do passageiro colhidos pelo motorista. */
export function TripProofCard({ tripId }: { tripId: string }) {
  const [p, setP] = useState<Proof | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/signature`, {}, "admin");
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Proof };
      if (j.success && j.data) setP(j.data);
    })();
  }, [tripId]);
  if (!p || (p.odometer_start == null && !p.signature && !p.rating)) return null;
  const panelKm = p.odometer_start != null && p.odometer_end != null ? Math.round((p.odometer_end - p.odometer_start) * 10) / 10 : null;
  const gap = panelKm != null && p.actual_km != null && p.actual_km > 0 ? Math.abs(panelKm - p.actual_km) / p.actual_km : 0;
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <h2 className="text-base font-semibold">Comprovação do motorista</h2>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">KM inicial (painel)</p>
          <p className="font-semibold">{n(p.odometer_start)}</p>
        </div>
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">KM final (painel)</p>
          <p className="font-semibold">{n(p.odometer_end)}</p>
        </div>
        <div className="rounded-xl bg-prime-bg p-3">
          <p className="text-xs text-prime-muted">Percorrido (cobrado)</p>
          <p className="font-semibold">{p.actual_km != null ? `${n(p.actual_km)} km` : "—"}</p>
          <p className="text-[11px] text-prime-muted">
            {p.km_source === "gps_trail" ? "pelo GPS" : p.km_source === "odometer" ? "pelo painel (GPS falhou)" : p.km_source === "manual" ? "digitado" : ""}
            {panelKm != null && p.km_source !== "odometer" ? ` · painel: ${n(panelKm)} km` : ""}
          </p>
        </div>
      </div>
      {p.rating ? (
        <p className={`mt-3 rounded-xl p-3 text-sm ${p.rating.stars <= 3 ? "bg-red-50 text-red-900" : "bg-prime-bg"}`}>
          Avaliação do passageiro: <b className="text-prime-gold">{"★".repeat(p.rating.stars)}</b>
          <span className="text-prime-muted">{"★".repeat(5 - p.rating.stars)}</span>
          {p.rating.comment ? ` · “${p.rating.comment}”` : ""}
        </p>
      ) : null}
      {gap > 0.2 && (panelKm ?? 0) > 2 ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          GPS e painel do carro diferem mais de 20%. Vale conferir antes de faturar.
        </p>
      ) : null}
      {p.signature ? (
        <div className="mt-4">
          {p.signature.image_data ? (
            <>
              <p className="text-xs text-prime-muted">
                Assinado por <strong className="text-prime-text">{p.signature.signer_name}</strong> em{" "}
                {new Date(p.signature.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signature.image_data} alt="Assinatura do passageiro" className="mt-2 h-28 rounded-xl border border-prime-border bg-white object-contain" />
            </>
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Não assinou.</strong> Motivo informado: {p.signature.skipped_reason}
            </p>
          )}
        </div>
      ) : p.required ? (
        <p className="mt-3 text-sm text-prime-muted">Assinatura ainda não colhida.</p>
      ) : null}
    </section>
  );
}
