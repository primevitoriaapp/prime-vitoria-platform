"use client";

import { StatusBadge } from "@/components/status-badge";
import { CopyTextButton } from "@/components/copy-text-button";
import type { TripOperationalStatus } from "@/lib/domain/types";

type Props = {
  tripId: string;
  operationalStatus: TripOperationalStatus;
  clientAmount?: number | null;
  driverAmount?: number | null;
  margin?: number | null;
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function TripFocusHeader({
  tripId,
  operationalStatus,
  clientAmount,
  driverAmount,
  margin
}: Props) {
  const hasFinance =
    clientAmount != null || driverAmount != null || margin != null;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-prime-border bg-white px-3 py-2 shadow-prime-card"
      aria-label="Resumo da viagem seleccionada"
    >
      <StatusBadge status={operationalStatus} />
      <span className="font-mono text-sm text-prime-text">{tripId}</span>
      <CopyTextButton text={tripId} label="Copiar ID" className="border-prime-border text-prime-text" />
      {hasFinance ? (
        <div className="ml-auto flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-prime-muted">Cliente: </span>
            <strong>{fmtMoney(clientAmount)}</strong>
          </span>
          <span>
            <span className="text-prime-muted">Motorista: </span>
            <strong>{fmtMoney(driverAmount)}</strong>
          </span>
          <span>
            <span className="text-prime-muted">Margem: </span>
            <strong className="text-prime-gold">{fmtMoney(margin)}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}
