/** Regras puras do vigia de atraso (sem banco). */
export type LateKind = "sem_motorista" | "nao_saiu" | "nao_chegou";

type T = { scheduled_at: string; presentation_minutes: number | null; operational_status: string; driver_id: string | null };

export function pickupAtIso(t: Pick<T, "scheduled_at" | "presentation_minutes">): string {
  const base = new Date(t.scheduled_at).getTime();
  const pres = Number(t.presentation_minutes ?? 0);
  return new Date(base - (pres > 0 ? pres : 0) * 60000).toISOString();
}

/** Qual aviso esta corrida merece agora (ou null). Puro, testável. */
export function lateKindFor(t: T, now = Date.now()): LateKind | null {
  const min = (new Date(pickupAtIso(t)).getTime() - now) / 60000;
  if (min < -180) return null; // corrida velha: não incomoda
  const s = t.operational_status;
  if (["requested", "approved"].includes(s) || (!t.driver_id && ["dispatched", "accepted", "reassigned"].includes(s))) {
    return min <= 60 ? "sem_motorista" : null;
  }
  if (["dispatched", "accepted", "reassigned"].includes(s)) {
    if (min <= -5) return "nao_chegou";
    return min <= 30 ? "nao_saiu" : null;
  }
  if (s === "on_the_way") return min <= -5 ? "nao_chegou" : null;
  return null;
}

