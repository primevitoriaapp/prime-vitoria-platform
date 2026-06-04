/** Tipos de serviço Prime Vitória (chave em client_pricing_rules / trips.service_type). */
export const PRIME_SERVICE_TYPES = [
  { id: "transfer_executivo", label: "Transfer executivo" },
  { id: "transfer_aeroporto", label: "Transfer aeroporto" },
  { id: "diaria", label: "Diária" },
  { id: "evento", label: "Evento" },
  { id: "van_grupo", label: "Van/grupo" },
  { id: "turismo", label: "Turismo" },
  { id: "corporativo", label: "Corporativo" }
] as const;

export type PrimeServiceTypeId = (typeof PRIME_SERVICE_TYPES)[number]["id"];

const BY_ID = new Map(PRIME_SERVICE_TYPES.map((o) => [o.id, o]));
const BY_LABEL = new Map(PRIME_SERVICE_TYPES.map((o) => [o.label.toLowerCase(), o]));

export function normalizePrimeServiceType(input: string): string {
  const t = input.trim();
  if (!t) return "transfer_executivo";
  if (BY_ID.has(t as PrimeServiceTypeId)) return t;
  const byLabel = BY_LABEL.get(t.toLowerCase());
  if (byLabel) return byLabel.id;
  return t;
}

export function primeServiceTypeLabel(serviceType: string): string {
  const key = normalizePrimeServiceType(serviceType);
  return BY_ID.get(key as PrimeServiceTypeId)?.label ?? serviceType;
}
