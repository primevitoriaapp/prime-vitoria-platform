import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";
import {
  corporativoBandeiraOperatorLabel,
  resolveCorporativoBandeiraKey,
  type CorporativoBandeiraKey
} from "@/lib/pricing/corporativo-bandeira";

export type PrimeServiceIcon = "car" | "van" | "clock" | "building";

export type PrimeServiceCatalogEntry = {
  id: string;
  label: string;
  description: string;
  icon: PrimeServiceIcon;
  charge_type: PrimeChargeType;
  clientValueLabel: string;
  driverValueLabel: string;
  showMinKm: boolean;
  /** Oculto em portal / dropdown cliente; só preços internos (ex.: bandeiras). */
  pricingOnly?: boolean;
  maxPassengers: number;
  defaults: {
    price_per_km?: number;
    min_km?: number;
    fixed_price?: number;
    driver_price_per_km?: number;
    driver_min_km?: number;
    driver_fixed_price?: number;
  };
};

const CORPORATIVO_BANDEIRA_META: Record<
  CorporativoBandeiraKey,
  { label: string; description: string }
> = {
  corporativo_b1: {
    label: "Corporativo — Bandeira 1 (06h00–18h59)",
    description: "Preço por km · horário diurno"
  },
  corporativo_b2: {
    label: "Corporativo — Bandeira 2 (19h00–05h59)",
    description: "Preço por km · horário noturno"
  }
};

/** Entradas de preço (inclui bandeiras; admin configura cada uma). */
export const PRIME_SERVICE_CATALOG_PRICING: PrimeServiceCatalogEntry[] = [
  {
    id: "transfer_seda",
    label: "Transfer Executivo",
    description: "Veículo executivo para até 4 passageiros",
    icon: "car",
    charge_type: "fixed",
    clientValueLabel: "Valor cliente (R$ fixo / faixa km)",
    driverValueLabel: "Valor motorista (R$)",
    showMinKm: true,
    maxPassengers: 4,
    defaults: { fixed_price: 0, driver_fixed_price: 0, min_km: 20 }
  },
  {
    id: "transfer_van",
    label: "Transfer Van Executiva",
    description: "Van executiva para até 15 passageiros",
    icon: "van",
    charge_type: "fixed",
    clientValueLabel: "Valor cliente (R$ fixo / faixa km)",
    driverValueLabel: "Valor motorista (R$)",
    showMinKm: true,
    maxPassengers: 15,
    defaults: { fixed_price: 0, driver_fixed_price: 0, min_km: 20 }
  },
  {
    id: "diaria_seda",
    label: "Diária Executiva",
    description: "Veículo à disposição por 10h / 110km",
    icon: "clock",
    charge_type: "daily",
    clientValueLabel: "Valor cliente (R$ diária)",
    driverValueLabel: "Valor motorista (R$ diária)",
    showMinKm: true,
    maxPassengers: 4,
    defaults: { fixed_price: 850, driver_fixed_price: 550, min_km: 110 }
  },
  {
    id: "diaria_van",
    label: "Diária Van",
    description: "Van à disposição por 10h / 110km",
    icon: "clock",
    charge_type: "daily",
    clientValueLabel: "Valor cliente (R$ diária)",
    driverValueLabel: "Valor motorista (R$ diária)",
    showMinKm: true,
    maxPassengers: 15,
    defaults: { fixed_price: 1200, driver_fixed_price: 900, min_km: 110 }
  },
  {
    id: "corporativo_b1",
    label: CORPORATIVO_BANDEIRA_META.corporativo_b1.label,
    description: CORPORATIVO_BANDEIRA_META.corporativo_b1.description,
    icon: "building",
    charge_type: "per_km",
    clientValueLabel: "Valor cliente (R$/km)",
    driverValueLabel: "Valor motorista (R$/km)",
    showMinKm: true,
    pricingOnly: true,
    maxPassengers: 4,
    defaults: { price_per_km: 0, driver_price_per_km: 0, min_km: 20 }
  },
  {
    id: "corporativo_b2",
    label: CORPORATIVO_BANDEIRA_META.corporativo_b2.label,
    description: CORPORATIVO_BANDEIRA_META.corporativo_b2.description,
    icon: "building",
    charge_type: "per_km",
    clientValueLabel: "Valor cliente (R$/km)",
    driverValueLabel: "Valor motorista (R$/km)",
    showMinKm: true,
    pricingOnly: true,
    maxPassengers: 4,
    defaults: { price_per_km: 0, driver_price_per_km: 0, min_km: 20 }
  }
];

/** Serviço único Corporativo (portal + agenda — bandeira automática). */
export const CORPORATIVO_UI_ENTRY: PrimeServiceCatalogEntry = {
  id: "corporativo",
  label: "Corporativo",
  description: "Transporte por km rodado (tarifa conforme horário)",
  icon: "building",
  charge_type: "per_km",
  clientValueLabel: "Valor cliente (R$/km)",
  driverValueLabel: "Valor motorista (R$/km)",
  showMinKm: true,
  maxPassengers: 4,
  defaults: { price_per_km: 0, driver_price_per_km: 0, min_km: 20 }
};

/** Catálogo visível em portal, nova corrida e checkboxes cliente (5 serviços). */
export const PRIME_SERVICE_CATALOG_UI: PrimeServiceCatalogEntry[] = [
  ...PRIME_SERVICE_CATALOG_PRICING.filter((s) => !s.pricingOnly),
  CORPORATIVO_UI_ENTRY
];

/** Retrocompat: export completo para ficha de preços admin. */
export const PRIME_SERVICE_CATALOG = PRIME_SERVICE_CATALOG_PRICING;

export const PRIME_SERVICE_IDS = PRIME_SERVICE_CATALOG_PRICING.map((s) => s.id);
export type PrimeServiceTypeId =
  | (typeof PRIME_SERVICE_CATALOG_PRICING)[number]["id"]
  | "corporativo";

const CATALOG_BY_ID = new Map(
  [...PRIME_SERVICE_CATALOG_PRICING, CORPORATIVO_UI_ENTRY].map((s) => [s.id, s])
);

export const CORPORATIVO_PRICING_KEYS = ["corporativo_b1", "corporativo_b2"] as const;

const LEGACY_SERVICE_MAP: Record<string, PrimeServiceTypeId> = {
  transfer_executivo: "transfer_seda",
  transfer_aeroporto: "transfer_seda",
  diaria: "diaria_seda",
  van_grupo: "transfer_van",
  corporativo: "corporativo",
  corporativo_diurno: "corporativo",
  corporativo_noturno: "corporativo",
  evento: "transfer_seda",
  turismo: "transfer_seda"
};

const LEGACY_LABEL_ALIASES: Record<string, PrimeServiceTypeId> = {
  "transfer sedã": "transfer_seda",
  "transfer executivo": "transfer_seda",
  "transfer van": "transfer_van",
  "transfer van executiva": "transfer_van",
  "diária sedã": "diaria_seda",
  "diária executiva": "diaria_seda",
  "diária van": "diaria_van",
  corporativo: "corporativo",
  "corporativo diurno (06h-18h)": "corporativo",
  "corporativo noturno (18h-06h)": "corporativo",
  "corporativo bandeira 1 (06h–18h)": "corporativo",
  "corporativo bandeira 1 (06h-18h)": "corporativo",
  "corporativo bandeira 2 (18h–06h)": "corporativo",
  "corporativo bandeira 2 (18h-06h)": "corporativo"
};

const BY_LABEL = new Map<string, PrimeServiceTypeId>(
  [
    ...PRIME_SERVICE_CATALOG_UI.flatMap((s) => [
      [s.label.toLowerCase(), s.id] as const,
      [s.id.replace(/_/g, " ").toLowerCase(), s.id] as const
    ]),
    ...Object.entries(LEGACY_LABEL_ALIASES)
  ]
);

export function getPrimeServiceCatalogEntry(id: string): PrimeServiceCatalogEntry | undefined {
  const key = normalizePrimeServiceType(id);
  return CATALOG_BY_ID.get(key);
}

export function getPrimeServiceCatalogPricingEntry(
  id: string
): PrimeServiceCatalogEntry | undefined {
  return CATALOG_BY_ID.get(id as PrimeServiceTypeId);
}

export function normalizePrimeServiceType(input: string): PrimeServiceTypeId {
  const t = input.trim();
  if (!t) return "transfer_seda";
  if (t === "corporativo_b1" || t === "corporativo_b2") return t;
  if (CATALOG_BY_ID.has(t)) return t as PrimeServiceTypeId;
  const legacy = LEGACY_SERVICE_MAP[t];
  if (legacy) return legacy;
  const byLabel = BY_LABEL.get(t.toLowerCase());
  if (byLabel) return byLabel as PrimeServiceTypeId;
  return "transfer_seda";
}

/** Rótulo para cliente (nunca expõe bandeira). */
export function primeServiceTypeLabel(
  serviceType: string,
  opts?: { audience?: "client" | "operator"; scheduledAt?: string | Date | null }
): string {
  const audience = opts?.audience ?? "operator";
  const key = normalizePrimeServiceType(serviceType);

  if (audience === "client" && (key === "corporativo" || key === "corporativo_b1" || key === "corporativo_b2")) {
    return "Corporativo";
  }

  if (key === "corporativo" && opts?.scheduledAt) {
    const band = resolveCorporativoBandeiraKey(opts.scheduledAt);
    return `Corporativo (${corporativoBandeiraOperatorLabel(band)})`;
  }

  if (key === "corporativo_b1" || key === "corporativo_b2") {
    return `Corporativo (${corporativoBandeiraOperatorLabel(key)})`;
  }

  return CATALOG_BY_ID.get(key)?.label ?? serviceType;
}

export function maxPassengersForService(serviceType: string): number {
  const key = normalizePrimeServiceType(serviceType);
  if (key === "corporativo") return CORPORATIVO_UI_ENTRY.maxPassengers;
  return CATALOG_BY_ID.get(key)?.maxPassengers ?? 4;
}

/** Dropdowns agenda / operador (sem bandeiras separadas). */
export const PRIME_SERVICE_TYPES = PRIME_SERVICE_CATALOG_UI.map((s) => ({
  id: s.id,
  label: s.label
}));

export { resolveCorporativoBandeiraKey, corporativoBandeiraOperatorLabel };
