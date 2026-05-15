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
      setMessage(json.error?.message ?? "Falha ao guardar KM.");
      return;
    }
    setMessage("KM actual guardado.");
    notifyOperationalClaimChanged(tripId);
    await load();
  }

  if (loading) return <p className="text-sm text-slate-600">A carregar distâncias…</p>;
  if (!data) return message ? <p className="text-sm text-red-700">{message}</p> : null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <h3 className="font-semibold text-slate-900">Distância (KM)</h3>
      <p className="mt-1 text-slate-700">
        Planeada: {data.planned_km != null ? `${data.planned_km} km` : "—"} · Real:{" "}
        {data.actual_km != null ? `${data.actual_km} km` : "—"}
        {data.km_source ? ` · fonte: ${data.km_source}` : null}
      </p>
      {canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="text-sm font-medium text-amber-800" onClick={() => void recalculate()}>
            Recalcular (coords + GPS)
          </button>
          <input
            type="number"
            step="0.01"
            value={manualActual}
            onChange={(e) => setManualActual(e.target.value)}
            placeholder="KM real manual"
            className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="button" className="text-sm text-amber-800" onClick={() => void saveManual()}>
            Guardar KM real
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-2 text-slate-600">{message}</p> : null}
    </section>
  );
}
