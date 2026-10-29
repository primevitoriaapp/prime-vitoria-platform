"use client";

import { TripAgendaOperationalStack } from "@/components/trip-agenda-operational-stack";
import { TripOperationalWorkflowPanel } from "@/components/trip-operational-workflow-panel";
import { TripAmountsEditor } from "@/components/trip-amounts-editor";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  assignedDriverId?: string | null;
  assignedVehicle?: { id: string; plate: string; model: string } | null;
  scheduledAt?: string | null;
  showClaimBar: boolean;
  showFinanceWrite: boolean;
  showErpEnqueue: boolean;
  financeDevRole?: "financeiro" | "admin" | "operador";
};

export function TripAgendaFocusPanel({
  tripId,
  operationalStatus,
  assignedDriverId,
  assignedVehicle,
  scheduledAt,
  showClaimBar,
  showFinanceWrite,
  showErpEnqueue,
  financeDevRole = "operador"
}: Props) {
  const dispatchRole = showFinanceWrite ? "admin" : "operador";

  return (
    <div className="space-y-4">
      {showClaimBar ? <TripAmountsEditor tripId={tripId} /> : null}
      {showClaimBar ? (
        <details className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Mais ações da corrida: confirmar, oferecer a vários motoristas, mudar situação, cancelar
          </summary>
          <div className="border-t border-prime-border p-2">
        <TripOperationalWorkflowPanel
          tripId={tripId}
          operationalStatus={operationalStatus}
          scheduledAt={scheduledAt}
          assignedDriverId={assignedDriverId}
          assignedVehicle={assignedVehicle}
          devFallbackRole={dispatchRole}
        />
          </div>
        </details>
      ) : null}
      <TripAgendaOperationalStack
        tripId={tripId}
        showClaimBar={false}
        showFinancePanel={showFinanceWrite || showErpEnqueue}
        financeDevRole={financeDevRole}
        financeWriteMode={showFinanceWrite}
      />
    </div>
  );
}
