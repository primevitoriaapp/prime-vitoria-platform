"use client";

import { useState } from "react";
import { OperationalTimelinePanel } from "@/components/operational-timeline-panel";
import { TripOperationalClaimBar } from "@/components/trip-operational-claim-bar";
import { TripOperatorNotesPanel } from "@/components/trip-operator-notes-panel";
import { TripFinanceErpPanel } from "@/components/trip-finance-erp-panel";
import { TripKmPanel } from "@/components/trip-km-panel";

type Props = {
  tripId: string;
  showClaimBar: boolean;
  showFinancePanel?: boolean;
  financeDevRole?: "financeiro" | "admin" | "operador";
  /** Geração de valores (financeiro/admin). Operador vê só ERP enqueue. */
  financeWriteMode?: boolean;
};

/** Painel agenda: reivindicação, histórico (auditoria + notas) e notas com refresco ligado. */
export function TripAgendaOperationalStack({
  tripId,
  showClaimBar,
  showFinancePanel = false,
  financeDevRole = "admin",
  financeWriteMode = true
}: Props) {
  const [timelineKey, setTimelineKey] = useState(0);

  return (
    <div className="space-y-6">
      {showClaimBar ? <TripOperationalClaimBar tripId={tripId} /> : null}
      {showFinancePanel ? (
        <TripFinanceErpPanel tripId={tripId} devFallbackRole={financeDevRole} writeMode={financeWriteMode} />
      ) : null}
      <TripKmPanel tripId={tripId} devFallbackRole={financeDevRole === "operador" ? "operador" : "admin"} />
      <div className="grid gap-6 lg:grid-cols-2">
        <OperationalTimelinePanel key={`${tripId}-tl-${timelineKey}`} tripId={tripId} />
        <TripOperatorNotesPanel tripId={tripId} onPosted={() => setTimelineKey((k) => k + 1)} />
      </div>
    </div>
  );
}
