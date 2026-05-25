"use client";

import { StatusBadge } from "@/components/status-badge";
import { CopyTextButton } from "@/components/copy-text-button";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
};

export function TripFocusHeader({ tripId, operationalStatus }: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
      aria-label="Resumo da viagem seleccionada"
    >
      <StatusBadge status={operationalStatus} />
      <span className="font-mono text-sm text-slate-700">{tripId}</span>
      <CopyTextButton
        text={tripId}
        label="Copiar ID"
        className="border-slate-300 text-slate-700"
      />
    </div>
  );
}
