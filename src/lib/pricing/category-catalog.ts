/** Serviços da tabela de preços por categoria (regras puras, testáveis). */

export type CategoryKind = "carro" | "van" | "onibus";

export type CategoryService =
  | "transfer"
  | "diaria_5h"
  | "diaria_10h"
  | "diaria_12h"
  | "km_b1"
  | "km_b2"
  | "hora_extra"
  | "hora_parada";

/** Modo escolhido no pedido (o que o cliente vê). */
export type ServiceMode = "transfer" | "diaria_5h" | "diaria_10h" | "diaria_12h" | "km";

export const CATEGORY_SERVICES: { id: CategoryService; label: string; unit: string; hint: string }[] = [
  { id: "transfer", label: "Transfer", unit: "R$ por trajeto", hint: "De um ponto a outro" },
  { id: "diaria_5h", label: "Diária 5h", unit: "R$ por diária", hint: "Veículo à disposição por 5 horas" },
  { id: "diaria_10h", label: "Diária 10h", unit: "R$ por diária", hint: "Veículo à disposição por 10 horas" },
  { id: "diaria_12h", label: "Diária 12h", unit: "R$ por diária", hint: "Veículo à disposição por 12 horas" },
  { id: "km_b1", label: "KM bandeira 1 (06h–18h59)", unit: "R$ por km", hint: "Corporativo por km rodado, de dia" },
  { id: "km_b2", label: "KM bandeira 2 (19h–05h59)", unit: "R$ por km", hint: "Corporativo por km rodado, à noite" },
  { id: "hora_extra", label: "Hora extra", unit: "R$ por hora", hint: "Passou do pacote da diária" },
  { id: "hora_parada", label: "Hora parada", unit: "R$ por hora", hint: "Espera além da tolerância" }
];

export const SERVICE_MODE_LABEL: Record<ServiceMode, string> = {
  transfer: "Transfer (só o trajeto)",
  diaria_5h: "À disposição — 5h",
  diaria_10h: "À disposição — 10h",
  diaria_12h: "À disposição — 12h",
  km: "Corporativo (por km)"
};

export const DIARIA_HOURS: Record<"diaria_5h" | "diaria_10h" | "diaria_12h", number> = {
  diaria_5h: 5,
  diaria_10h: 10,
  diaria_12h: 12
};

export type PriceCell = {
  service: CategoryService;
  enabled: boolean;
  client_price: number | null;
  partner_price: number | null;
};

/** Modos que o cliente pode pedir para a categoria (a partir das células ligadas). */
export function enabledModes(cells: PriceCell[]): ServiceMode[] {
  const on = new Set(cells.filter((c) => c.enabled).map((c) => c.service));
  const modes: ServiceMode[] = [];
  if (on.has("transfer")) modes.push("transfer");
  if (on.has("diaria_5h")) modes.push("diaria_5h");
  if (on.has("diaria_10h")) modes.push("diaria_10h");
  if (on.has("diaria_12h")) modes.push("diaria_12h");
  if (on.has("km_b1") || on.has("km_b2")) modes.push("km");
  return modes;
}

/** service_type legado (rótulos, motor antigo, limites) a partir da categoria + modo. */
export function legacyServiceType(kind: CategoryKind, mode: ServiceMode): string {
  if (mode === "km") return "corporativo";
  const big = kind !== "carro";
  if (mode === "transfer") return big ? "transfer_van" : "transfer_seda";
  return big ? "diaria_van" : "diaria_seda";
}

/** Bandeira pelo horário de Brasília: 06:00–18:59 = B1; 19:00–05:59 = B2. */
export function bandeiraForIso(iso: string): "km_b1" | "km_b2" {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date(iso)));
  return h >= 6 && h < 19 ? "km_b1" : "km_b2";
}

const money = (n: number) => Math.round(n * 100) / 100;

export type CategoryPricingInput = {
  mode: ServiceMode;
  scheduledAt: string;
  km: number | null;
  /** Horas usadas na diária (fim − início). */
  usedHours?: number | null;
  cells: PriceCell[];
  /** Km mínimo cobrado do cliente (ex.: 20). O parceiro recebe pelo km real. */
  minKmClient?: number | null;
};

export type CategoryPricingResult = {
  client: number | null;
  partner: number | null;
  detail: string;
};

/**
 * Valor da corrida pela tabela da empresa. null = sem valor na tabela (a combinar).
 * Transfer/diária: preço fixo (+ hora extra além do pacote). KM: km × preço da bandeira.
 */
export function priceFromCategoryTable(input: CategoryPricingInput): CategoryPricingResult {
  const cell = (s: CategoryService) => input.cells.find((c) => c.service === s && c.enabled) ?? null;
  if (input.mode === "km") {
    const b = bandeiraForIso(input.scheduledAt);
    const c = cell(b);
    if (!c || c.client_price == null || input.km == null) return { client: null, partner: null, detail: "sem preço por km" };
    const min = input.minKmClient && input.minKmClient > 0 ? input.minKmClient : 0;
    const billedKm = Math.max(input.km, min);
    return {
      client: money(billedKm * c.client_price),
      partner: c.partner_price == null ? null : money(input.km * c.partner_price),
      detail:
        `${billedKm} km × ${b === "km_b1" ? "bandeira 1" : "bandeira 2"}` +
        (billedKm > input.km ? ` (mínimo de ${min} km; rodou ${input.km} km)` : "")
    };
  }
  const c = cell(input.mode);
  if (!c || c.client_price == null) return { client: null, partner: null, detail: "a combinar" };
  let client = c.client_price;
  let partner = c.partner_price;
  let detail = input.mode === "transfer" ? "transfer" : `diária ${DIARIA_HOURS[input.mode]}h`;
  if (input.mode !== "transfer" && input.usedHours != null) {
    const extra = Math.max(0, Math.ceil((input.usedHours - DIARIA_HOURS[input.mode]) * 2) / 2);
    const he = cell("hora_extra");
    if (extra > 0 && he?.client_price != null) {
      client += extra * he.client_price;
      if (partner != null && he.partner_price != null) partner += extra * he.partner_price;
      detail += ` + ${extra}h extra`;
    }
  }
  return { client: money(client), partner: partner == null ? null : money(partner), detail };
}
