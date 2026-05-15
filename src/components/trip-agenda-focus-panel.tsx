"use client";

import { useRouter } from "next/navigation";
import { TripAgendaOperationalStack } from "@/components/trip-agenda-operational-stack";
import { TripAgendaQuickActions } from "@/components/trip-agenda-quick-actions";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  showClaimBar: boolean;
  showFinanceWrite: boolean;
  showErpEnqueue: boolean;
  financeDevRole?: "financeiro" | "admin" | "operador";
};

export function TripAgendaFocusPanel({
  tripId,
  operationalStatus,
  showClaimBar,
  showFinanceWrite,
  showErpEnqueue,
  financeDevRole = "operador"
}: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <TripAgendaQuickActions
        tripId={tripId}
        operationalStatus={operationalStatus}
        devFallbackRole={showFinanceWrite ? "admin" : "operador"}
        onDone={() => router.refresh()}
      />
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
