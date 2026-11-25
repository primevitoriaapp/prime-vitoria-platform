/** Adicionais da corrida lançados pela central (sem banco: usado na tela e na fatura). */
export type TripExtraKind = "hora_extra" | "espera" | "estacionamento" | "pedagio" | "outro";

export const TRIP_EXTRA_LABEL: Record<TripExtraKind, string> = {
  hora_extra: "Hora extra",
  espera: "Espera / parada",
  estacionamento: "Estacionamento",
  pedagio: "Pedágio",
  outro: "Adicional"
};

export type TripExtra = {
  id: string;
  kind: TripExtraKind;
  description: string | null;
  minutes: number | null;
  client_amount: number;
  driver_amount: number;
  created_at: string;
};

export function fmtMinutes(min: number | null | undefined): string {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`) : `${r} min`;
}

/** Texto da linha na fatura: "Hora extra — 1h30 (parada a pedido do passageiro)". */
export function extraLine(e: Pick<TripExtra, "kind" | "description" | "minutes">): string {
  const base = e.kind === "outro" && e.description ? e.description : TRIP_EXTRA_LABEL[e.kind];
  const dur = fmtMinutes(e.minutes);
  const note = e.kind !== "outro" && e.description ? ` (${e.description})` : "";
  return `${base}${dur ? ` — ${dur}` : ""}${note}`;
}

/** Base da NR para agrupar: "NR263739-A2" → "NR263739"; "263739" → "NR263739" quando o cliente usa "NR". */
export function refBase(ref: string | null | undefined): string | null {
  const r = String(ref ?? "").trim().toUpperCase();
  if (!r) return null;
  return r.split("-")[0] || null;
}
export const refKey = (ref: string | null | undefined) => (refBase(ref) ?? "").replace(/^NR/, "");
