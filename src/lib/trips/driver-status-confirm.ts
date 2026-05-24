import type { TripOperationalStatus } from "../domain/types.ts";
import { STATUS_CORRIDA_PT } from "../i18n/pt-br.ts";

const NEEDS_CONFIRM: TripOperationalStatus[] = ["completed", "no_show"];

/** Confirmação no cliente para evitar transições irreversíveis por toque acidental. */
export function confirmDriverStatusTransition(to: TripOperationalStatus): boolean {
  if (typeof window === "undefined") return true;
  if (!NEEDS_CONFIRM.includes(to)) return true;
  if (to === "completed") {
    return window.confirm(
      "Concluir esta corrida?\n\nO sistema recalcula KM e valores automaticamente (regra do cliente)."
    );
  }
  return window.confirm(
    `Marcar como ${STATUS_CORRIDA_PT[to]}?\n\nConfirme que o passageiro não foi atendido.`
  );
}
