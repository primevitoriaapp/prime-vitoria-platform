"use client";

import { useRouter } from "next/navigation";
import { TripAgendaOperationalStack } from "@/components/trip-agenda-operational-stack";
import { TripAgendaQuickActions } from "@/components/trip-agenda-quick-actions";
import { TripAgendaDispatchPanel } from "@/components/trip-agenda-dispatch-panel";
import { TripAgendaOffersPanel } from "@/components/trip-agenda-offers-panel";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  assignedDriverId?: string | null;
  assignedVehicle?: { id: string; plate: string; model: string } | null;
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
  showClaimBar,
  showFinanceWrite,
  showErpEnqueue,
  financeDevRole = "operador"
}: Props) {
  const router = useRouter();
  const dispatchRole = showFinanceWrite ? "admin" : "operador";

  return (
    <div className="space-y-4">
      <TripAgendaQuickActions
        tripId={tripId}
        operationalStatus={operationalStatus}
        devFallbackRole={dispatchRole}
        onDone={() => router.refresh()}
      />
      {showClaimBar ? (
        <>
          <TripAgendaOffersPanel
            tripId={tripId}
            operationalStatus={operationalStatus}
            devFallbackRole={dispatchRole}
            onDone={() => router.refresh()}
          />
          <TripAgendaDispatchPanel
            tripId={tripId}
            operationalStatus={operationalStatus}
            assignedDriverId={assignedDriverId}
            assignedVehicle={assignedVehicle}
            devFallbackRole={dispatchRole}
            onDone={() => router.refresh()}
          />
        </>
      ) : null}
      <TripAgendaOperationalStack
        tripId={tripId}
        showClaimBar={showClaimBar}
        showFinancePanel={showFinanceWrite || showErpEnqueue}
        financeDevRole={financeDevRole}
        financeWriteMode={showFinanceWrite}
      />
    </div>
  );
}
