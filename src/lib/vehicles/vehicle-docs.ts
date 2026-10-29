/** Situação dos documentos do veículo (seguro, licenciamento/CRLV, vistoria). Funções puras. */
export type DocState = "vencido" | "vence_30" | "ok" | "sem_data";

export const VEHICLE_DOCS = [
  { key: "insurance_expires_at", label: "Seguro" },
  { key: "licensing_expires_at", label: "Licenciamento (CRLV)" },
  { key: "inspection_expires_at", label: "Vistoria" }
] as const;

export function docState(date: string | null | undefined, today: string): DocState {
  if (!date) return "sem_data";
  if (date < today) return "vencido";
  const in30 = new Date(Date.parse(`${today}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  return date <= in30 ? "vence_30" : "ok";
}

export function worstDocState(v: Record<string, unknown>, today: string): DocState {
  const order: DocState[] = ["vencido", "vence_30", "sem_data", "ok"];
  const states = VEHICLE_DOCS.map((d) => docState(v[d.key] as string | null, today));
  return order.find((o) => states.includes(o)) ?? "ok";
}
