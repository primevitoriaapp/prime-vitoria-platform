/** Regras do PRIME CLUB que valem no servidor e nas telas. */

export const BENEFIT_KINDS = ["percentual", "valor", "por_litro", "preco_exclusivo", "cupom", "gratuito", "link", "carteirinha"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

export const KIND_LABEL: Record<BenefitKind, string> = {
  percentual: "Desconto em %",
  valor: "Desconto em R$",
  por_litro: "Desconto por litro",
  preco_exclusivo: "Preço exclusivo",
  cupom: "Cupom",
  gratuito: "Benefício gratuito",
  link: "Link externo",
  carteirinha: "Apresentar carteirinha"
};

export const PROSPECT_STAGES = [
  ["prospectado", "Prospectado"],
  ["contatado", "Contatado"],
  ["aguardando_retorno", "Aguardando retorno"],
  ["em_negociacao", "Em negociação"],
  ["aguardando_formalizacao", "Aguardando formalização"],
  ["credenciado", "Credenciado"],
  ["publicado", "Publicado"],
  ["perdido", "Perdido"]
] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number][0];

export const CATEGORY_ICONS: Record<string, string> = {
  fuel: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 11h10M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3",
  tire: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  wrench: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  car: "M5 16h14M6 16l1.5-6h9L18 16M5 16v3h3v-3M16 16v3h3v-3M8 13h.01M16 13h.01",
  dumbbell: "M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  heart: "M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z",
  food: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  tag: "M20 12l-8 8-9-9V3h8zM7.5 7.5h.01",
  bag: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"
};

/** Texto curto do benefício para cartões: "15% OFF", "R$ 0,20/litro", "Grátis"… */
export function benefitHeadline(b: { kind: BenefitKind; value: number | null; title?: string | null }): string {
  const v = Number(b.value ?? 0);
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  switch (b.kind) {
    case "percentual":
      return v ? `${v.toLocaleString("pt-BR")}% de desconto` : "Desconto";
    case "valor":
      return v ? `${brl(v)} de desconto` : "Desconto";
    case "por_litro":
      return v ? `${brl(v)} por litro` : "Desconto no litro";
    case "preco_exclusivo":
      return v ? `Por ${brl(v)}` : "Preço exclusivo";
    case "gratuito":
      return "Grátis";
    case "cupom":
      return "Cupom exclusivo";
    case "link":
      return "Condição especial";
    default:
      return "Benefício exclusivo";
  }
}

/**
 * Economia registrada num uso. Só conta o que o estabelecimento informou.
 * percentual → % da compra · valor → valor fixo · por_litro → litros × valor · demais → valor informado.
 */
export function savedAmount(kind: BenefitKind, value: number | null, input: { purchase?: number | null; liters?: number | null; saved?: number | null }): number {
  const v = Number(value ?? 0);
  const r = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  if (kind === "percentual" && input.purchase) return r((input.purchase * v) / 100);
  if (kind === "valor" && v) return r(input.purchase ? Math.min(v, input.purchase) : v);
  if (kind === "por_litro" && input.liters) return r(input.liters * v);
  return r(Number(input.saved ?? 0));
}

/** Código do QR: 10 caracteres sem letras parecidas (0/O, 1/I/L). */
export function newClubCode(random: (n: number) => Uint8Array): string {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(random(10), (b) => abc.charAt(b % abc.length)).join("");
}

export const CLUB_CODE_MINUTES = 5;
export const clubValidateUrl = (code: string) => `https://www.primevitoria.com/clube/v/${code}`;

/** Parceiro visível no app: publicado e com data de publicação já alcançada. */
export function partnerIsLive(p: { status: string; publish_at: string | null }, now = new Date()): boolean {
  return p.status === "publicado" && (!p.publish_at || new Date(p.publish_at) <= now);
}

/** Benefício dentro da vigência. */
export function benefitIsValid(b: { active: boolean; valid_from: string | null; valid_until: string | null }, today: string): boolean {
  if (!b.active) return false;
  if (b.valid_from && b.valid_from > today) return false;
  if (b.valid_until && b.valid_until < today) return false;
  return true;
}
