/** Situação do motorista no mapa da central (regras puras). */
export type FleetStatus = "livre" | "ocupado" | "deslocando" | "proximo" | "offline";

export const FLEET_STATUS: Record<FleetStatus, { label: string; color: string }> = {
  livre: { label: "Livre", color: "#16A34A" },
  ocupado: { label: "Ocupado (em atendimento)", color: "#DC2626" },
  deslocando: { label: "Em deslocamento até o cliente", color: "#6B7280" },
  proximo: { label: "Corrida agendada em breve", color: "#2563EB" },
  offline: { label: "Offline", color: "#CBD5E1" }
};

/**
 * operational_status do motorista + próxima corrida dele.
 * "Em breve" = corrida atribuída começando nas próximas 2 horas (e ele está livre agora).
 */
export function fleetStatus(
  operationalStatus: string | null | undefined,
  nextTripAt: string | null | undefined,
  now: Date = new Date()
): FleetStatus {
  const s = operationalStatus ?? "offline";
  if (s === "em_atendimento" || s === "no_local" || s === "ocupado") return "ocupado";
  if (s === "deslocando") return "deslocando";
  if (s === "offline") return "offline";
  if (nextTripAt) {
    const diff = new Date(nextTripAt).getTime() - now.getTime();
    if (diff >= -15 * 60_000 && diff <= 2 * 3600_000) return "proximo";
  }
  return "livre";
}
