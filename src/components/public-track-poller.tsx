"use client";

import { useCallback, useEffect, useState } from "react";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

type TrackPayload = {
  operational_status: TripOperationalStatus;
  origin_text: string;
  destination_text: string;
  passenger_name: string | null;
  scheduled_at: string;
  location: { lat: number; lng: number; recorded_at: string } | null;
};

type Props = {
  token: string;
  initial: TrackPayload;
};

export function PublicTrackPoller({ token, initial }: Props) {
  const [data, setData] = useState<TrackPayload>(initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/track/${encodeURIComponent(token)}`, {
        cache: "no-store"
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: TrackPayload;
        error?: { message?: string };
      };
      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? "Nao foi possivel atualizar");
        return;
      }
      setError(null);
      setData(json.data);
    } catch {
      setError("Falha de rede ao atualizar");
    }
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const statusLabel = STATUS_CORRIDA_PT[data.operational_status] ?? data.operational_status;

  return (
    <>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm leading-relaxed text-slate-300">
        <p>
          <span className="text-slate-500">Estado operacional:</span>{" "}
          <span className="font-medium text-amber-400">{statusLabel}</span>
        </p>
        <p className="mt-3">
          <span className="text-slate-500">Origem:</span> {data.origin_text}
        </p>
        <p className="mt-1">
          <span className="text-slate-500">Destino:</span> {data.destination_text}
        </p>
        {data.passenger_name ? (
          <p className="mt-1">
            <span className="text-slate-500">Passageiro:</span> {data.passenger_name}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          Agendada:{" "}
          {new Date(data.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </p>
        <p className="mt-3 text-xs text-slate-600">Atualiza automaticamente a cada 15 s.</p>
      </div>
      {data.location ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ultima posicao registrada</p>
          <p className="mt-2 font-mono text-amber-400/90">
            {data.location.lat.toFixed(5)}, {data.location.lng.toFixed(5)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(data.location.recorded_at).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "medium"
            })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Ainda nao ha posicao GPS associada a esta corrida.</p>
      )}
    </>
  );
}
