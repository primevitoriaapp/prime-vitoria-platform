/** Períodos e grupos de status da tela Agendamentos (horário de Brasília, sem horário de verão). */
import type { TripOperationalStatus } from "@/lib/domain/types";

export type BookingPeriod = "ontem" | "hoje" | "amanha" | "semana" | "mes";

export const BOOKING_PERIODS: { id: BookingPeriod; label: string }[] = [
  { id: "ontem", label: "Ontem" },
  { id: "hoje", label: "Hoje" },
  { id: "amanha", label: "Amanhã" },
  { id: "semana", label: "Próx. 7 dias" },
  { id: "mes", label: "Mês" }
];

const OFFSET = "-03:00";
const DAY = 86400000;

/** Data (AAAA-MM-DD) de hoje em Brasília. */
export function brToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Intervalo [from, to] em ISO para o período escolhido. */
export function bookingPeriodRange(period: BookingPeriod, now: Date = new Date()): { from: string; to: string } {
  const today = brToday(now);
  const start = (d: string) => new Date(`${d}T00:00:00${OFFSET}`).toISOString();
  const end = (d: string) => new Date(`${d}T23:59:59.999${OFFSET}`).toISOString();
  switch (period) {
    case "ontem":
      return { from: start(addDays(today, -1)), to: end(addDays(today, -1)) };
    case "hoje":
      return { from: start(today), to: end(today) };
    case "amanha":
      return { from: start(addDays(today, 1)), to: end(addDays(today, 1)) };
    case "semana":
      return { from: start(today), to: end(addDays(today, 6)) };
    case "mes": {
      const first = `${today.slice(0, 7)}-01`;
      const [y, m] = today.split("-").map(Number);
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: start(first), to: end(`${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`) };
    }
  }
}

export type BookingGroup = "agendada" | "atribuida" | "em_rota" | "finalizada" | "cancelada";

export const BOOKING_GROUPS: { id: BookingGroup; label: string; color: string; bg: string }[] = [
  { id: "agendada", label: "Sem motorista", color: "#b91c1c", bg: "#fef2f2" },
  { id: "atribuida", label: "Motorista definido", color: "#c2410c", bg: "#fff7ed" },
  { id: "em_rota", label: "Em rota", color: "#1d4ed8", bg: "#eff6ff" },
  { id: "finalizada", label: "Finalizada", color: "#15803d", bg: "#f0fdf4" },
  { id: "cancelada", label: "Cancelada", color: "#6b7280", bg: "#f3f4f6" }
];

export function bookingGroupOf(status: TripOperationalStatus | string): BookingGroup {
  switch (status) {
    case "requested":
    case "approved":
      return "agendada";
    case "dispatched":
    case "accepted":
    case "reassigned":
      return "atribuida";
    case "on_the_way":
    case "arrived":
    case "in_progress":
      return "em_rota";
    case "completed":
      return "finalizada";
    default:
      return "cancelada";
  }
}

export const STATUS_LABEL: Record<string, string> = {
  requested: "Pedido novo",
  approved: "Confirmada",
  dispatched: "Enviada ao motorista",
  accepted: "Motorista aceitou",
  reassigned: "Motorista trocado",
  on_the_way: "A caminho",
  arrived: "No local",
  in_progress: "Em viagem",
  completed: "Finalizada",
  cancelled: "Cancelada",
  rejected: "Recusada",
  no_show: "Passageiro não apareceu"
};
