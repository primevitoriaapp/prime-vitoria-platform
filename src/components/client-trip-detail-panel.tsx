"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { BackButton } from "@/components/back-button";
import { StatusBadge } from "@/components/status-badge";
import { ClientOperationalTimeline } from "@/components/client-operational-timeline";
import { ClientTrackingReadonly } from "@/components/client-tracking-readonly";
import { CopyTextButton } from "@/components/copy-text-button";
import type { Trip } from "@/lib/domain/types";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";

type CostCenter = { id: string; code: string | null; name: string };

type Props = {
  tripId: string;
  costCenters?: CostCenter[];
  devFallbackRole?: "cliente" | "admin";
};

export function ClientTripDetailPanel({
  tripId,
  costCenters = [],
  devFallbackRole = "cliente"
}: Props) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: Trip; error?: { message?: string } };
    if (!res.ok || !json.success || !json.data) {
      setTrip(null);
      setError(json.error?.message ?? "Corrida não encontrada.");
      setLoading(false);
      return;
    }
    setTrip(json.data);
    setLoading(false);
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const cc = trip?.cost_center_id
    ? costCenters.find((c) => c.id === trip.cost_center_id)
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-4">
          <BackButton
            fallbackHref="/client#corridas"
            className="text-sm text-amber-400 hover:underline border-0 bg-transparent px-0 py-0 font-normal rounded-none"
          />
          <h1 className="text-lg font-semibold text-white">Detalhe da corrida</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        {loading ? (
          <div className="animate-pulse space-y-4" aria-busy="true" aria-label="A carregar detalhe">
            <div className="h-6 w-48 rounded bg-slate-800" />
            <div className="h-20 rounded-xl bg-slate-800/80" />
            <div className="h-32 rounded-xl bg-slate-800/60" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : trip ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={trip.operational_status} variant="portal" />
              <span className="font-mono text-xs text-amber-500/90">{trip.id}</span>
              <CopyTextButton
                text={trip.id}
                label="Copiar ID"
                className="border-slate-600 text-amber-200/90"
              />
            </div>
            <ClientOperationalTimeline current={trip.operational_status} />
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 text-sm">
              <p className="text-white font-medium">
                {trip.passenger_name?.trim() || "Passageiro"}
                {trip.service_type ? (
                  <span className="text-slate-500">
                    {" "}
                    · {primeServiceTypeLabel(trip.service_type, { audience: "client" })}
                  </span>
                ) : null}
              </p>
              {trip.passenger_phone?.trim() ? (
                <p className="text-slate-500">
                  Telefone: <span className="text-slate-300">{trip.passenger_phone.trim()}</span>
                </p>
              ) : null}
              {trip.passenger_count != null && trip.passenger_count > 0 ? (
                <p className="text-slate-500">
                  Passageiros: <span className="text-slate-300">{trip.passenger_count}</span>
                </p>
              ) : null}
              <p className="text-slate-400">
                {trip.origin_text} → {trip.destination_text}
              </p>
              <p className="text-slate-500">
                Agendada:{" "}
                {formatBrDateTime(trip.scheduled_at)}
              </p>
              {cc ? (
                <p className="text-slate-500">
                  Centro de custo: {cc.code ? `${cc.code} · ` : ""}
                  {cc.name}
                </p>
              ) : null}
            </div>
            <ClientTrackingReadonly operationalStatus={trip.operational_status} />
          </>
        ) : null}
      </main>
    </div>
  );
}
