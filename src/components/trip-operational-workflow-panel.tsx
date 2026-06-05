"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { notifyOperationalClaimChanged } from "@/lib/client/operational-claim-events";
import { TripOperationalClaimBar } from "@/components/trip-operational-claim-bar";
import { TripAgendaDispatchPanel } from "@/components/trip-agenda-dispatch-panel";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  scheduledAt?: string | null;
  assignedDriverId?: string | null;
  assignedVehicle?: { id: string; plate: string; model: string } | null;
  devFallbackRole?: "operador" | "admin";
};

export function TripOperationalWorkflowPanel({
  tripId,
  operationalStatus,
  scheduledAt,
  assignedDriverId,
  assignedVehicle,
  devFallbackRole = "operador"
}: Props) {
  const router = useRouter();
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveMessage, setApproveMessage] = useState<string | null>(null);

  async function approve() {
    setApproveBusy(true);
    setApproveMessage(null);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${tripId}/approve`,
      { method: "POST", body: JSON.stringify({}) },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    setApproveBusy(false);
    if (!res.ok || !json.success) {
      setApproveMessage(json.error?.message ?? "Falha ao aprovar.");
      return;
    }
    setApproveMessage("Corrida aprovada.");
    notifyOperationalClaimChanged(tripId);
    router.refresh();
  }

  const showApprove = operationalStatus === "requested";
  const showDispatch = operationalStatus === "approved" || operationalStatus === "reassigned";
  const showAssignment =
    assignedDriverId &&
    !["requested", "approved", "cancelled"].includes(operationalStatus);

  return (
    <article className="rounded-lg border border-prime-border bg-white shadow-prime-card">
      <header className="border-b border-prime-border px-4 py-3">
        <h3 className="text-base font-semibold text-prime-text">Atendimento da corrida</h3>
        <p className="mt-0.5 text-xs text-prime-muted">
          Assumir → Aprovar → Despachar · Estado: {STATUS_CORRIDA_PT[operationalStatus]}
        </p>
      </header>

      <div className="space-y-4 px-4 py-4">
        <section aria-label="Passo 1 — assumir">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-prime-muted">1. Assumir</p>
          <TripOperationalClaimBar tripId={tripId} devFallbackRole={devFallbackRole} variant="minimal" />
        </section>

        {showApprove ? (
          <section aria-label="Passo 2 — aprovar" className="border-t border-prime-border pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-prime-muted">2. Aprovar</p>
            <button
              type="button"
              disabled={approveBusy}
              onClick={() => void approve()}
              className="btn-outline min-h-[2.75rem] px-5 disabled:opacity-50"
            >
              {approveBusy ? "A aprovar…" : "Aprovar corrida"}
            </button>
            {approveMessage ? (
              <p className="mt-2 text-sm text-prime-text" role="status">
                {approveMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {showDispatch ? (
          <section aria-label="Passo 3 — despachar" className="border-t border-prime-border pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-prime-muted">3. Despachar</p>
            <TripAgendaDispatchPanel
              embedded
              tripId={tripId}
              operationalStatus={operationalStatus}
              scheduledAt={scheduledAt}
              devFallbackRole={devFallbackRole}
              onDone={() => router.refresh()}
            />
          </section>
        ) : null}

        {showAssignment && !showDispatch ? (
          <section className="border-t border-prime-border pt-4">
            <TripAgendaDispatchPanel
              embedded
              tripId={tripId}
              operationalStatus={operationalStatus}
              scheduledAt={scheduledAt}
              assignedDriverId={assignedDriverId}
              assignedVehicle={assignedVehicle}
              devFallbackRole={devFallbackRole}
              onDone={() => router.refresh()}
            />
          </section>
        ) : null}
      </div>
    </article>
  );
}
