"use client";

import { useState } from "react";
import { OperationalTimelinePanel } from "@/components/operational-timeline-panel";
import { TripOperationalClaimBar } from "@/components/trip-operational-claim-bar";
import { TripOperatorNotesPanel } from "@/components/trip-operator-notes-panel";

type Props = {
  tripId: string;
  showClaimBar: boolean;
};

/** Painel agenda: reivindicação, histórico (auditoria + notas) e notas com refresco ligado. */
export function TripAgendaOperationalStack({ tripId, showClaimBar }: Props) {
  const [timelineKey, setTimelineKey] = useState(0);

  return (
    <div className="space-y-6">
      {showClaimBar ? <TripOperationalClaimBar tripId={tripId} /> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <OperationalTimelinePanel key={`${tripId}-tl-${timelineKey}`} tripId={tripId} />
        <TripOperatorNotesPanel tripId={tripId} onPosted={() => setTimelineKey((k) => k + 1)} />
      </div>
    </div>
  );
}
