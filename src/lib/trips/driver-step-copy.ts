import type { TripOperationalStatus } from "../domain/types.ts";
import { STATUS_CORRIDA_PT } from "../i18n/pt-br.ts";
import { driverNextStatuses } from "./driver-next-status.ts";

/** Rótulos dos botões de acção no app do motorista (não confundir com badges de estado). */
export const DRIVER_TRIP_ACTION_PT: Partial<Record<TripOperationalStatus, string>> = {
  accepted: "Aceitar corrida",
  on_the_way: "A caminho do passageiro",
  arrived: "Cheguei ao local",
  in_progress: "Iniciar corrida",
  completed: "Finalizar corrida"
};

/** Instrução curta do que o motorista deve fazer agora. */
export function driverOperationalHint(status: TripOperationalStatus): string {
  switch (status) {
    case "dispatched":
      return "Nova corrida atribuída — aceite para iniciar o serviço.";
    case "accepted":
      return "Confirme que está a caminho do passageiro.";
    case "on_the_way":
      return "Ao chegar ao local de embarque, marque Cheguei ao local.";
    case "arrived":
      return "Inicie a viagem ou registe não comparecimento.";
    case "in_progress":
      return "Conduza até ao destino e finalize quando o passageiro desembarcar.";
    case "completed":
      return "Corrida concluída.";
    default:
      return "Acompanhe o estado da corrida abaixo.";
  }
}

export function driverPrimaryActionLabel(
  status: TripOperationalStatus,
  next: TripOperationalStatus | undefined
): string {
  if (!next) return "Sem acção pendente";
  return DRIVER_TRIP_ACTION_PT[next] ?? STATUS_CORRIDA_PT[next];
}

export function driverFlowChip(status: TripOperationalStatus): string {
  if (status === "dispatched") return "Central → Aguarda a sua aceitação";
  if (status === "accepted" || status === "on_the_way") return "Em curso → Cliente acompanha em breve";
  if (status === "arrived" || status === "in_progress") return "Em curso → Cliente vê tracking activo";
  if (status === "completed") return "Concluída → Cliente vê histórico";
  return "Operador → Motorista → Cliente";
}

export function pickPrimaryActiveTripId<T extends { id: string; operational_status: TripOperationalStatus; scheduled_at: string }>(
  trips: T[]
): string | null {
  if (trips.length === 0) return null;
  const rank: Record<string, number> = {
    in_progress: 0,
    arrived: 1,
    on_the_way: 2,
    accepted: 3,
    dispatched: 4
  };
  const sorted = [...trips].sort((a, b) => {
    const ra = rank[a.operational_status] ?? 99;
    const rb = rank[b.operational_status] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  });
  return sorted[0]?.id ?? null;
}

export function driverNextStatusLabel(status: TripOperationalStatus): string | null {
  const next = driverNextStatuses(status)[0];
  return next ? (DRIVER_TRIP_ACTION_PT[next] ?? STATUS_CORRIDA_PT[next]) : null;
}
