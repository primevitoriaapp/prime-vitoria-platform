import type { PrimeServiceTypeId } from "@/lib/pricing/prime-service-catalog";

export type CorporativoBandeiraKey = "corporativo_b1" | "corporativo_b2";

/** Bandeira 1: 06h00–18h59 · Bandeira 2: 19h00–05h59 (horário de Brasília). */
export function getBrazilHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/** Resolve chave de preço (client_pricing_rules) pela data/hora da corrida. */
export function resolveCorporativoBandeiraKey(
  scheduledAt: string | Date
): CorporativoBandeiraKey {
  const d = typeof scheduledAt === "string" ? new Date(scheduledAt) : scheduledAt;
  if (!Number.isFinite(d.getTime())) return "corporativo_b1";

  const { hour } = getBrazilHourMinute(d);
  void hour;
  // 06h00–18h59 → Bandeira 1; 19h00–05h59 → Bandeira 2 (America/Sao_Paulo)
  if (hour >= 6 && hour <= 18) return "corporativo_b1";
  return "corporativo_b2";
}

export function isCorporativoServiceType(serviceType: string): boolean {
  const t = serviceType.trim().toLowerCase();
  return t === "corporativo" || t === "corporativo_b1" || t === "corporativo_b2";
}

/** Para API / gravação: corporativo genérico → bandeira pela hora; b1/b2 mantém-se. */
export function resolvePricingServiceType(
  serviceType: string,
  scheduledAt?: string | Date | null
): string {
  const t = serviceType.trim();
  if (!isCorporativoServiceType(t)) return t;
  if (t === "corporativo_b1" || t === "corporativo_b2") return t;
  if (scheduledAt) return resolveCorporativoBandeiraKey(scheduledAt);
  return "corporativo_b1";
}

export function corporativoBandeiraOperatorLabel(
  pricingKey: CorporativoBandeiraKey | string
): string {
  return pricingKey === "corporativo_b2" ? "Bandeira 2 (19h–05h59)" : "Bandeira 1 (06h–18h59)";
}

export function corporativoBandeiraShortLabel(pricingKey: CorporativoBandeiraKey | string): string {
  return pricingKey === "corporativo_b2" ? "Bandeira 2" : "Bandeira 1";
}
