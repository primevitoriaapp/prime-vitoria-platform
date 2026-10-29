/** Contas a pagar da empresa: categorias, situação e próxima recorrência (funções puras). */

export const PAYABLE_CATEGORIES = [
  { id: "combustivel", label: "Combustível" },
  { id: "manutencao", label: "Manutenção e peças" },
  { id: "pedagio_estacionamento", label: "Pedágio e estacionamento" },
  { id: "seguro", label: "Seguro" },
  { id: "ipva_licenciamento", label: "IPVA e licenciamento" },
  { id: "financiamento", label: "Financiamento / aluguel de veículo" },
  { id: "salarios", label: "Salários e encargos" },
  { id: "impostos", label: "Impostos" },
  { id: "aluguel", label: "Aluguel e condomínio" },
  { id: "contabilidade", label: "Contabilidade" },
  { id: "sistemas", label: "Sistemas e assinaturas" },
  { id: "telefone_internet", label: "Telefone e internet" },
  { id: "marketing", label: "Marketing" },
  { id: "parceiros", label: "Parceiros (fora do app)" },
  { id: "outros", label: "Outros" }
] as const;

export function categoryLabel(id: string): string {
  return PAYABLE_CATEGORIES.find((c) => c.id === id)?.label ?? "Outros";
}

export type PayableSituation = "vencida" | "vence_hoje" | "vence_breve" | "em_dia" | "paga" | "cancelada";

export function payableSituation(row: { status: string; due_date: string }, today: string, soonDays = 5): PayableSituation {
  if (row.status === "paga") return "paga";
  if (row.status === "cancelada") return "cancelada";
  if (row.due_date < today) return "vencida";
  if (row.due_date === today) return "vence_hoje";
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  return row.due_date <= limit.toISOString().slice(0, 10) ? "vence_breve" : "em_dia";
}

/** Mesmo dia no mês seguinte; se o mês não tem o dia (31), usa o último dia. */
export function nextMonthlyDue(due: string): string {
  const [y, m, d] = due.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return new Date(Date.UTC(y, m, day)).toISOString().slice(0, 10);
}
