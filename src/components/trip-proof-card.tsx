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
  if (!p || (p.odometer_start == null && !p.signature)) return null;
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
          <p className="text-xs text-prime-muted">Percorrido</p>
          <p className="font-semibold">{p.actual_km != null ? `${n(p.actual_km)} km` : "—"}</p>
        </div>
      </div>
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
