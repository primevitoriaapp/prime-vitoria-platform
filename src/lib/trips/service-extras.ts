/** Marcações da reserva e horário de apresentação do motorista. */

export const SERVICE_EXTRAS = [
  { id: "placa_nome", label: "Placa com o nome", short: "Placa" },
  { id: "receptivo", label: "Receptivo no desembarque", short: "Receptivo" },
  { id: "agua", label: "Água a bordo", short: "Água" },
  { id: "ajuda_bagagem", label: "Ajuda com bagagem", short: "Bagagem" },
  { id: "cadeirinha", label: "Cadeirinha infantil", short: "Cadeirinha" },
  { id: "assento_elevacao", label: "Assento de elevação", short: "Elevação" },
  { id: "bilingue", label: "Motorista bilíngue", short: "Bilíngue" },
  { id: "traje_social", label: "Motorista de terno", short: "Terno" }
] as const;

export type ServiceExtraId = (typeof SERVICE_EXTRAS)[number]["id"];

const IDS = new Set<string>(SERVICE_EXTRAS.map((e) => e.id));

export function cleanServiceExtras(input: unknown): ServiceExtraId[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is ServiceExtraId => typeof v === "string" && IDS.has(v)))];
}

export function serviceExtrasLabel(ids: readonly string[] | null | undefined): string {
  if (!ids?.length) return "";
  return SERVICE_EXTRAS.filter((e) => ids.includes(e.id))
    .map((e) => e.label)
    .join(", ");
}

export const PRESENTATION_OPTIONS = [0, 10, 15, 20, 30, 45, 60] as const;

/** Horário em que o motorista deve estar no local (ISO), ou null se não há antecedência. */
export function presentationAtIso(scheduledAt: string, minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const t = new Date(scheduledAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - minutes * 60000).toISOString();
}
