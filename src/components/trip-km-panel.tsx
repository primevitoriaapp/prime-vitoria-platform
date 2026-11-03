"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { notifyOperationalClaimChanged } from "@/lib/client/operational-claim-events";

type KmData = {
  planned_km: number | null;
  actual_km: number | null;
  km_source: string | null;
  km_updated_at: string | null;
  coords_available: boolean;
};

type Props = {
  tripId: string;
  devFallbackRole?: "operador" | "admin" | "financeiro";
  canEdit?: boolean;
};

export function TripKmPanel({ tripId, devFallbackRole = "operador", canEdit = true }: Props) {
  const [data, setData] = useState<KmData | null>(null);
  const [manualActual, setManualActual] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/distance`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: KmData; error?: { message?: string } };
    if (!res.ok || !json.success || !json.data) {
      setData(null);
      setMessage(json.error?.message ?? "Sem dados de distância.");
      setLoading(false);
      return;
    }
    setData(json.data);
    if (json.data.actual_km != null) setManualActual(String(json.data.actual_km));
    setLoading(false);
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recalculate() {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/distance`,
      { method: "PATCH", body: JSON.stringify({ mode: "recalculate" }) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao recalcular.");
      return;
    }
    setMessage("Distância recalculada.");
    notifyOperationalClaimChanged(tripId);
    await load();
  }

  async function saveManual() {
    setMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/distance`,
      {
        method: "PATCH",
        body: JSON.stringify({ mode: "manual", actual_km: Number(manualActual) })
      },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao salvar KM.");
      return;
    }
    setMessage("KM salvo.");
    notifyOperationalClaimChanged(tripId);
    await load();
  }

  if (loading) return <div className="h-24 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  if (!data) return message ? <p className="text-sm text-red-700">{message}</p> : null;
  const SRC: Record<string, string> = { gps_trail: "GPS do celular", manual: "digitado", odometer: "painel do carro", coords: "estimado pelo mapa" };
  const km = (n: number | null | undefined) => (n != null ? `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : "—");

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <h3 className="text-[17px] font-semibold tracking-tight text-prime-text">Distância</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-xl bg-prime-bg px-4 py-3">
          <p className="text-sm text-prime-muted">Prevista</p>
          <p className="text-xl font-semibold tracking-tight">{km(data.planned_km)}</p>
        </div>
        <div className="rounded-xl bg-prime-bg px-4 py-3">
          <p className="text-sm text-prime-muted">Rodada</p>
          <p className="text-xl font-semibold tracking-tight">{km(data.actual_km)}</p>
          {data.km_source ? <p className="text-xs text-prime-muted">{SRC[data.km_source] ?? data.km_source}</p> : null}
        </div>
      </div>
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Corrigir KM rodado</span>
            <input type="number" step="0.1" inputMode="decimal" value={manualActual} onChange={(e) => setManualActual(e.target.value)} placeholder="Ex.: 32,5" className="prime-input w-36" />
          </label>
          <button type="button" className="btn-primary" disabled={!manualActual} onClick={() => void saveManual()}>
            Salvar
          </button>
          <button type="button" className="btn-outline" onClick={() => void recalculate()}>
            Recalcular pelo GPS
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-sm text-prime-text">{message}</p> : null}
    </section>
  );
}
