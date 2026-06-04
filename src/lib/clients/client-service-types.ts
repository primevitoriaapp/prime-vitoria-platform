import { PRIME_SERVICE_CATALOG } from "@/lib/pricing/prime-service-catalog";

/** Tipos de serviço corporativo (perfil cliente PJ) — alinhado ao catálogo operacional. */
export const CLIENT_SERVICE_TYPE_OPTIONS = PRIME_SERVICE_CATALOG.map((s) => ({
  id: s.id,
  label: s.label
}));

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
