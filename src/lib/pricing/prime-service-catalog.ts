import type { PrimeChargeType } from "@/lib/pricing/prime-price-estimate";

export type PrimeServiceIcon = "car" | "van" | "clock" | "building";

export type PrimeServiceCatalogEntry = {
  id: string;
  label: string;
  description: string;
  icon: PrimeServiceIcon;
  charge_type: PrimeChargeType;
  /** Rótulo do valor cobrado do cliente */
  clientValueLabel: string;
  /** Rótulo do repasse ao motorista */
  driverValueLabel: string;
  showMinKm: boolean;
  defaults: {
    price_per_km?: number;
    min_km?: number;
    fixed_price?: number;
    driver_price_per_km?: number;
    driver_min_km?: number;
    driver_fixed_price?: number;
  };
};

/** Seis serviços operacionais padronizados Prime Vitória. */
export const PRIME_SERVICE_CATALOG: PrimeServiceCatalogEntry[] = [
  {
    id: "transfer_seda",
    label: "Transfer Executivo",
    description: "Veículo executivo para até 4 passageiros",
    icon: "car",
    charge_type: "fixed",
    clientValueLabel: "Valor cliente (R$ fixo / faixa km)",
    driverValueLabel: "Valor motorista (R$)",
    showMinKm: true,
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
    defaults: { fixed_price: 1200, driver_fixed_price: 900, min_km: 110 }
  },
  {
    id: "corporativo_b1",
    label: "Corporativo Diurno (06h-18h)",
    description: "Transporte por km rodado",
    icon: "building",
    charge_type: "per_km",
    clientValueLabel: "Valor cliente (R$/km)",
    driverValueLabel: "Valor motorista (R$/km)",
    showMinKm: true,
    defaults: { price_per_km: 0, driver_price_per_km: 0, min_km: 20 }
  },
  {
    id: "corporativo_b2",
    label: "Corporativo Noturno (18h-06h)",
    description: "Transporte por km rodado",
    icon: "building",
    charge_type: "per_km",
    clientValueLabel: "Valor cliente (R$/km)",
    driverValueLabel: "Valor motorista (R$/km)",
    showMinKm: true,
    defaults: { price_per_km: 0, driver_price_per_km: 0, min_km: 20 }
  }
];

export const PRIME_SERVICE_IDS = PRIME_SERVICE_CATALOG.map((s) => s.id);
export type PrimeServiceTypeId = (typeof PRIME_SERVICE_CATALOG)[number]["id"];

const CATALOG_BY_ID = new Map(PRIME_SERVICE_CATALOG.map((s) => [s.id, s]));

/** IDs legados (migrations / dados antigos) → serviço actual. */
const LEGACY_SERVICE_MAP: Record<string, PrimeServiceTypeId> = {
  transfer_executivo: "transfer_seda",
  transfer_aeroporto: "transfer_seda",
  diaria: "diaria_seda",
  van_grupo: "transfer_van",
  corporativo: "corporativo_b1",
  evento: "transfer_seda",
  turismo: "transfer_seda"
};

/** Rótulos antigos (dados já gravados) → id actual. */
const LEGACY_LABEL_ALIASES: Record<string, PrimeServiceTypeId> = {
  "transfer sedã": "transfer_seda",
  "transfer van": "transfer_van",
  "diária sedã": "diaria_seda",
  "diária van": "diaria_van",
  "corporativo bandeira 1 (06h–18h)": "corporativo_b1",
  "corporativo bandeira 1 (06h-18h)": "corporativo_b1",
  "corporativo bandeira 2 (18h–06h)": "corporativo_b2",
  "corporativo bandeira 2 (18h-06h)": "corporativo_b2"
};

const BY_LABEL = new Map<string, PrimeServiceTypeId>(
  [
    ...PRIME_SERVICE_CATALOG.flatMap((s) => [
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

export function normalizePrimeServiceType(input: string): PrimeServiceTypeId {
  const t = input.trim();
  if (!t) return "transfer_seda";
  if (CATALOG_BY_ID.has(t)) return t as PrimeServiceTypeId;
  const legacy = LEGACY_SERVICE_MAP[t];
  if (legacy) return legacy;
  const byLabel = BY_LABEL.get(t.toLowerCase());
  if (byLabel) return byLabel as PrimeServiceTypeId;
  return "transfer_seda";
}

export function primeServiceTypeLabel(serviceType: string): string {
  const key = normalizePrimeServiceType(serviceType);
  return CATALOG_BY_ID.get(key)?.label ?? serviceType;
}

/** Lista para dropdowns (id + label). */
export const PRIME_SERVICE_TYPES = PRIME_SERVICE_CATALOG.map((s) => ({
  id: s.id,
  label: s.label
}));
