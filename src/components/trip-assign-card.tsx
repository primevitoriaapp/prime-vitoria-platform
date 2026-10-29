"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { QuickAssign, useAssignDrivers } from "@/components/quick-assign";
import { STATUS_LABEL } from "@/lib/operations/booking-periods";

type Trip = {
  id: string;
  operational_status: string;
  driver_id?: string | null;
  driver_name?: string | null;
  vehicle_category_id?: string | null;
  vehicle?: { model?: string | null; plate?: string | null } | null;
};

/** Tela da corrida: quem é o motorista e a lista para definir ou trocar, sem abrir outro painel. */
export function TripAssignCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const { drivers } = useAssignDrivers();

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Trip };
    if (res.ok && json.success && json.data) setTrip(json.data);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!trip) return null;
  const canAssign = ["requested", "approved", "dispatched", "accepted", "reassigned"].includes(trip.operational_status);
  if (!canAssign && !trip.driver_id) return null;

  return (
    <section className="rounded-2xl border-2 border-prime-gold/60 bg-white p-4 shadow-prime-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-prime-muted">Motorista</p>
          {trip.driver_id ? (
            <p className="text-lg font-semibold">
              {trip.driver_name ?? "Motorista definido"}
              {trip.vehicle?.plate ? (
                <span className="ml-2 text-sm font-normal text-prime-muted">
                  {trip.vehicle.model} · {trip.vehicle.plate}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-lg font-semibold text-red-700">Ainda sem motorista</p>
          )}
        </div>
        <span className="rounded-full bg-prime-bg px-3 py-1 text-xs font-semibold ring-1 ring-prime-border">
          {STATUS_LABEL[trip.operational_status] ?? trip.operational_status}
        </span>
      </div>
      {canAssign ? (
        <div className="mt-4 border-t border-prime-border pt-4">
          <p className="mb-2 text-sm font-semibold">{trip.driver_id ? "Trocar por:" : "Escolha o motorista:"}</p>
          <QuickAssign
            inline
            tripId={trip.id}
            status={trip.operational_status}
            currentDriverId={trip.driver_id ?? null}
            drivers={drivers}
            categoryId={trip.vehicle_category_id ?? null}
            onDone={() => {
              void load();
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
