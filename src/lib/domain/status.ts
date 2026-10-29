import type { TripOperationalStatus } from "./types";

export const ALLOWED_TRANSITIONS: Record<TripOperationalStatus, TripOperationalStatus[]> = {
  requested: ["approved", "cancelled"],
  approved: ["dispatched", "cancelled"],
  dispatched: ["accepted", "on_the_way", "reassigned", "cancelled"],
  accepted: ["on_the_way", "reassigned", "cancelled"],
  on_the_way: ["arrived", "reassigned"],
  arrived: ["in_progress", "no_show"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
  rejected: [],
  no_show: [],
  reassigned: ["dispatched", "cancelled"]
};

export function canTransition(from: TripOperationalStatus, to: TripOperationalStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function operationalTransitionMessage(
  from: TripOperationalStatus,
  to: TripOperationalStatus
): string {
  return `Cannot transition from ${from} to ${to}`;
}

/** Valida transição atómica (uma única mudança de estado). */
export function validateOperationalTransition(
  from: TripOperationalStatus,
  to: TripOperationalStatus
): { ok: true } | { ok: false; message: string } {
  if (canTransition(from, to)) return { ok: true };
  return { ok: false, message: operationalTransitionMessage(from, to) };
}

/** Estados em que o portal cliente pode solicitar cancelamento (antes do despacho ativo). */
export const CLIENT_CANCELLABLE_STATUSES: TripOperationalStatus[] = ["requested", "approved"];

/**
 * Portal do cliente: cancela só antes do despacho e antes do horário marcado.
 * Depois do horário, quem cancela é a central (pode haver deslocamento a cobrar).
 */
export function clientMayCancelTrip(
  status: TripOperationalStatus,
  scheduledAt?: string | null,
  now: Date = new Date()
): boolean {
  if (!CLIENT_CANCELLABLE_STATUSES.includes(status)) return false;
  if (scheduledAt) {
    const t = new Date(scheduledAt).getTime();
    if (Number.isFinite(t) && t <= now.getTime()) return false;
  }
  return true;
}

export type OperationalTransitionPlan =
  | { ok: true; steps: TripOperationalStatus[] }
  | { ok: false };

/**
 * Plano de transições atómicas (ex.: reatribuição accepted → reassigned → dispatched).
 * Não substitui validação de papel (motorista vs operador).
 */
export function planOperationalTransition(
  from: TripOperationalStatus,
  to: TripOperationalStatus
): OperationalTransitionPlan {
  if (canTransition(from, to)) {
    return { ok: true, steps: [to] };
  }
  if (
    to === "dispatched" &&
    canTransition(from, "reassigned") &&
    canTransition("reassigned", "dispatched")
  ) {
    return { ok: true, steps: ["reassigned", "dispatched"] };
  }
  return { ok: false };
}
