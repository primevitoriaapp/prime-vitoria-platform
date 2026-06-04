/** Tipos de serviço corporativo (perfil cliente PJ). */
export const CLIENT_SERVICE_TYPE_OPTIONS = [
  { id: "transfer_executivo", label: "Transfer executivo" },
  { id: "diaria", label: "Diária" },
  { id: "transfer_aeroporto", label: "Transfer aeroporto" },
  { id: "evento", label: "Evento" },
  { id: "van_grupo", label: "Van/grupo" },
  { id: "turismo", label: "Turismo" },
  { id: "corporativo", label: "Corporativo" }
] as const;

export type ClientServiceTypeId = (typeof CLIENT_SERVICE_TYPE_OPTIONS)[number]["id"];

const VALID_IDS = new Set<string>(CLIENT_SERVICE_TYPE_OPTIONS.map((o) => o.id));

export function normalizeServiceTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is string => typeof v === "string" && VALID_IDS.has(v)))];
}

export function formatServiceTypesLabel(ids: string[] | null | undefined): string {
  if (!ids?.length) return "—";
  return ids
    .map((id) => CLIENT_SERVICE_TYPE_OPTIONS.find((o) => o.id === id)?.label ?? id)
    .join(", ");
}
