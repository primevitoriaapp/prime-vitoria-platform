/** Opções da ficha completa do motorista (BLOCO 2). */

export const CNH_CATEGORY_OPTIONS = ["A", "B", "C", "D", "E"] as const;
export type CnhCategoryId = (typeof CNH_CATEGORY_OPTIONS)[number];

export const OPERATIONAL_CATEGORY_OPTIONS = [
  { id: "executivo", label: "Executivo" },
  { id: "van", label: "Van" },
  { id: "suv", label: "SUV" },
  { id: "blindado", label: "Blindado" },
  { id: "noiva", label: "Noiva" }
] as const;
export type OperationalCategoryId = (typeof OPERATIONAL_CATEGORY_OPTIONS)[number]["id"];

export const SERVICE_REGION_OPTIONS = [
  { id: "grande_vitoria", label: "Grande Vitória" },
  { id: "interior_es", label: "Interior ES" },
  { id: "outros_estados", label: "Outros estados" }
] as const;
export type ServiceRegionId = (typeof SERVICE_REGION_OPTIONS)[number]["id"];

export const OPERATIONAL_STATUS_OPTIONS = [
  { id: "ativo", label: "Ativo" },
  { id: "inativo", label: "Inativo" },
  { id: "ferias", label: "Férias" },
  { id: "suspenso", label: "Suspenso" }
] as const;
export type OperationalStatusId = (typeof OPERATIONAL_STATUS_OPTIONS)[number]["id"];

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v).trim()).filter(Boolean);
}

export function parseStoredStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return normalizeStringArray(raw);
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Compat: valor único antigo em operational_category / service_region. */
export function operationalCategoriesFromRow(row: {
  operational_categories?: unknown;
  operational_category?: string | null;
}): OperationalCategoryId[] {
  const fromArray = parseStoredStringArray(row.operational_categories);
  const ids = new Set<OperationalCategoryId>();
  for (const v of fromArray) {
    if (OPERATIONAL_CATEGORY_OPTIONS.some((o) => o.id === v)) ids.add(v as OperationalCategoryId);
  }
  const legacy = row.operational_category?.trim().toLowerCase();
  if (legacy && OPERATIONAL_CATEGORY_OPTIONS.some((o) => o.id === legacy)) {
    ids.add(legacy as OperationalCategoryId);
  }
  return [...ids];
}

export function serviceRegionsFromRow(row: {
  service_regions?: unknown;
  regions?: unknown;
  service_region?: string | null;
}): ServiceRegionId[] {
  const fromArray = parseStoredStringArray(row.service_regions ?? row.regions);
  const ids = new Set<ServiceRegionId>();
  for (const v of fromArray) {
    if (SERVICE_REGION_OPTIONS.some((o) => o.id === v)) ids.add(v as ServiceRegionId);
  }
  const legacy = row.service_region?.trim().toLowerCase().replace(/\s+/g, "_");
  if (legacy === "grande_vitória" || legacy === "grande_vitoria") ids.add("grande_vitoria");
  if (legacy?.includes("interior")) ids.add("interior_es");
  if (legacy?.includes("outros")) ids.add("outros_estados");
  return [...ids];
}

export function cnhCategoriesFromRow(row: {
  cnh_categories?: unknown;
  cnh_category?: string | null;
}): CnhCategoryId[] {
  const fromArray = parseStoredStringArray(row.cnh_categories);
  const ids = new Set<CnhCategoryId>();
  for (const v of fromArray) {
    const u = v.toUpperCase();
    if (CNH_CATEGORY_OPTIONS.includes(u as CnhCategoryId)) ids.add(u as CnhCategoryId);
  }
  const legacy = row.cnh_category?.trim().toUpperCase();
  if (legacy) {
    for (const ch of legacy.replace(/[^A-E]/gi, "")) {
      if (CNH_CATEGORY_OPTIONS.includes(ch as CnhCategoryId)) ids.add(ch as CnhCategoryId);
    }
  }
  return [...ids];
}

export function operationalStatusFromRow(row: {
  operational_status?: string | null;
  active?: boolean;
  available?: boolean;
}): OperationalStatusId {
  const s = row.operational_status?.trim().toLowerCase();
  if (s && OPERATIONAL_STATUS_OPTIONS.some((o) => o.id === s)) {
    return s as OperationalStatusId;
  }
  if (row.active === false) return "inativo";
  if (row.available === false) return "ferias";
  return "ativo";
}

export function activeFlagsFromOperationalStatus(status: OperationalStatusId): {
  active: boolean;
  available: boolean;
} {
  switch (status) {
    case "inativo":
      return { active: false, available: false };
    case "ferias":
      return { active: true, available: false };
    case "suspenso":
      return { active: false, available: false };
    default:
      return { active: true, available: true };
  }
}

export function formatOperationalCategoriesLabel(ids: string[] | null | undefined): string {
  if (!ids?.length) return "—";
  return ids
    .map((id) => OPERATIONAL_CATEGORY_OPTIONS.find((o) => o.id === id)?.label ?? id)
    .join(", ");
}

export function daysUntilDate(isoDate: string | null | undefined): number | null {
  if (!isoDate?.trim()) return null;
  const d = new Date(isoDate.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function isCnhExpiringWithinDays(expiry: string | null | undefined, withinDays = 30): boolean {
  const days = daysUntilDate(expiry);
  return days !== null && days >= 0 && days < withinDays;
}
