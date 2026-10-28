"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { Trip, TripOperationalStatus } from "@/lib/domain/types";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import { CLIENT_STATUS, CLIENT_STATUS_TONE_CLASS, tripShortNumber } from "@/lib/client/client-status";
import { PrimeLogoMark } from "@/components/prime-logo-mark";

type CostCenter = { id: string; code: string | null; name: string };

type TripDetail = Trip & {
  notes?: string | null;
  driver_name?: string | null;
  vehicle?: { model?: string | null; plate?: string | null } | null;
};

type Props = {
  tripId: string;
  costCenters?: CostCenter[];
  devFallbackRole?: "cliente" | "admin";
  tenantId?: string;
};

const STEPS: { label: string; statuses: TripOperationalStatus[] }[] = [
  { label: "Pedido recebido", statuses: ["requested"] },
  { label: "Confirmada", statuses: ["approved"] },
  { label: "Motorista definido", statuses: ["dispatched", "accepted", "reassigned"] },
  { label: "A caminho / no local", statuses: ["on_the_way", "arrived"] },
  { label: "Em viagem", statuses: ["in_progress"] },
  { label: "Concluída", statuses: ["completed"] }
];

function stepIndex(status: TripOperationalStatus) {
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

export function ClientTripDetailPanel({ tripId, costCenters = [], devFallbackRole = "cliente", tenantId }: Props) {
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: TripDetail; error?: { message?: string } };
    if (!res.ok || !json.success || !json.data) {
      setTrip(null);
      setError(res.status === 404 ? "Corrida não encontrada." : (json.error?.message ?? "Não foi possível abrir a corrida."));
    } else {
      setTrip(json.data);
    }
    setLoading(false);
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId ?? null, ["trips"], load);

  const cc = trip?.cost_center_id ? costCenters.find((c) => c.id === trip.cost_center_id) : null;
  const st = trip ? (CLIENT_STATUS[trip.operational_status] ?? { label: trip.operational_status, tone: "done" as const }) : null;
  const idx = trip ? stepIndex(trip.operational_status) : -1;
  const vehicleText = trip?.vehicle ? [trip.vehicle.model, trip.vehicle.plate ? `placa ${trip.vehicle.plate}` : null].filter(Boolean).join(" · ") : null;

  return (
    <div className="min-h-screen bg-prime-bg text-prime-text">
      <header className="bg-[#111] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/client?aba=corridas" className="text-sm text-white/80 hover:text-white">
            ← Voltar
          </Link>
          <PrimeLogoMark size={32} />
        </div>
      </header>

      <main className="mx-auto grid max-w-3xl gap-4 px-4 py-6">
        {loading ? (
          <div className="h-48 animate-pulse rounded-2xl border border-prime-border bg-white" />
        ) : error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>
        ) : trip && st ? (
          <>
            <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-prime-muted">Corrida Nº {tripShortNumber(trip.id)}</p>
                  <p className="mt-1 font-prime-display text-2xl">{formatBrDateTime(trip.scheduled_at)}</p>
                  <p className="text-sm text-prime-muted">
                    {trip.service_type ? primeServiceTypeLabel(trip.service_type, { audience: "client" }) : null}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${CLIENT_STATUS_TONE_CLASS[st.tone]}`}>
                  {st.label}
                </span>
              </div>

              {idx >= 0 ? (
                <ol className="mt-5 grid grid-cols-6 gap-1" aria-label="Andamento da corrida">
                  {STEPS.map((s, i) => (
                    <li key={s.label} className="grid gap-1.5">
                      <span className={`h-1.5 rounded-full ${i <= idx ? "bg-prime-gold" : "bg-gray-200"}`} />
                      <span className={`hidden text-[11px] leading-tight sm:block ${i === idx ? "font-semibold" : "text-prime-muted"}`}>
                        {s.label}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}

              <div className="mt-5 grid gap-3 text-sm">
                <div className="flex gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-prime-gold" aria-hidden />
                  <div>
                    <p className="text-xs text-prime-muted">Embarque</p>
                    <p>{trip.origin_text}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#111]" aria-hidden />
                  <div>
                    <p className="text-xs text-prime-muted">Destino</p>
                    <p>{trip.destination_text}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-prime-border bg-white p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-prime-muted">Passageiro</p>
                <p className="mt-1 font-medium">{trip.passenger_name?.trim() || "A definir"}</p>
                {trip.passenger_phone?.trim() ? <p className="text-prime-muted">{trip.passenger_phone.trim()}</p> : null}
                {trip.passenger_count && trip.passenger_count > 1 ? <p className="text-prime-muted">{trip.passenger_count} pessoas</p> : null}
                {cc ? <p className="mt-1 text-prime-muted">Centro de custo: {cc.code ? `${cc.code} · ` : ""}{cc.name}</p> : null}
              </div>
              <div className="rounded-2xl border border-prime-border bg-white p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-prime-muted">Motorista e veículo</p>
                {trip.driver_name ? (
                  <>
                    <p className="mt-1 font-medium">{trip.driver_name}</p>
                    {vehicleText ? <p className="text-prime-muted">{vehicleText}</p> : null}
                  </>
                ) : (
                  <p className="mt-1 text-prime-muted">A central avisa assim que o motorista for definido.</p>
                )}
              </div>
            </section>

            {trip.notes?.trim() ? (
              <section className="rounded-2xl border border-prime-border bg-white p-4 text-sm">
                <p className="text-xs uppercase tracking-wide text-prime-muted">Observações</p>
                <p className="mt-1 whitespace-pre-line">{trip.notes}</p>
              </section>
            ) : null}

            <a
              href={`/voucher/${trip.id}`}
              className="rounded-xl bg-[#111] px-4 py-3 text-center text-sm font-semibold text-white hover:bg-black"
            >
              Abrir voucher (PDF)
            </a>
          </>
        ) : null}
      </main>
    </div>
  );
}
