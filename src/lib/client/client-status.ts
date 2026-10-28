import type { TripOperationalStatus } from "../domain/types";

export type ClientStatusTone = "waiting" | "confirmed" | "live" | "done" | "off";

/** Status da corrida na linguagem do cliente corporativo. */
export const CLIENT_STATUS: Record<TripOperationalStatus, { label: string; tone: ClientStatusTone }> = {
  requested: { label: "Aguardando confirmação", tone: "waiting" },
  approved: { label: "Confirmada", tone: "confirmed" },
  dispatched: { label: "Motorista definido", tone: "confirmed" },
  accepted: { label: "Motorista definido", tone: "confirmed" },
  reassigned: { label: "Motorista definido", tone: "confirmed" },
  on_the_way: { label: "Motorista a caminho", tone: "live" },
  arrived: { label: "Motorista no local", tone: "live" },
  in_progress: { label: "Em viagem", tone: "live" },
  completed: { label: "Concluída", tone: "done" },
  cancelled: { label: "Cancelada", tone: "off" },
  rejected: { label: "Não atendida", tone: "off" },
  no_show: { label: "Passageiro não compareceu", tone: "off" }
};

export const CLIENT_STATUS_TONE_CLASS: Record<ClientStatusTone, string> = {
  waiting: "bg-amber-50 text-amber-900 ring-amber-200",
  confirmed: "bg-sky-50 text-sky-900 ring-sky-200",
  live: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  done: "bg-gray-100 text-gray-700 ring-gray-200",
  off: "bg-red-50 text-red-800 ring-red-200"
};

const CLOSED: TripOperationalStatus[] = ["completed", "cancelled", "rejected", "no_show"];

/** Próximas = ainda vão acontecer ou estão acontecendo. */
export function isUpcomingForClient(status: TripOperationalStatus, scheduledAt: string, now = new Date()): boolean {
  if (CLOSED.includes(status)) return false;
  if (CLIENT_STATUS[status]?.tone === "live") return true;
  // Corridas abertas que passaram há mais de 12h vão para o histórico.
  return new Date(scheduledAt).getTime() >= now.getTime() - 12 * 3600_000;
}

/** Número curto da corrida para falar com a central (igual ao voucher). */
export function tripShortNumber(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
