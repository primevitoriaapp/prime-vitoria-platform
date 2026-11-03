/** Linha do tempo simples da corrida (para o gestor do cliente e para a central). Funções puras. */

export type ProgressStep = { key: string; label: string; hint: string; at: string | null; state: "done" | "current" | "todo" };

const STEPS: { key: string; label: string; hint: string; statuses: string[] }[] = [
  { key: "agendada", label: "Corrida agendada", hint: "Pedido recebido pela Prime", statuses: ["requested"] },
  { key: "preparando", label: "Equipe Prime preparando", hint: "Corrida confirmada, escolhendo o motorista", statuses: ["approved"] },
  { key: "motorista", label: "Motorista atribuído", hint: "Motorista e carro definidos", statuses: ["dispatched", "accepted", "reassigned"] },
  { key: "caminho", label: "Motorista a caminho", hint: "Indo até o embarque", statuses: ["on_the_way", "arrived"] },
  { key: "iniciada", label: "Corrida iniciada", hint: "Passageiro a bordo", statuses: ["in_progress"] },
  { key: "finalizada", label: "Corrida finalizada", hint: "Chegou ao destino", statuses: ["completed"] }
];

export function stepIndexOf(status: string): number {
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

/**
 * `history` = mudanças de status (to_status + quando). O primeiro passo usa a criação da corrida.
 * Se a corrida foi direto para um passo adiante (ex.: central já agendou com motorista), os anteriores contam como feitos.
 */
export function buildProgress(
  status: string,
  createdAt: string,
  history: { to_status: string; changed_at: string }[]
): { steps: ProgressStep[]; cancelled: { at: string | null } | null } {
  const sorted = [...history].sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  const firstAt = (statuses: string[]) => sorted.find((h) => statuses.includes(h.to_status))?.changed_at ?? null;
  const cancelled = ["cancelled", "canceled", "no_show", "rejected"].includes(status);
  // No cancelamento, o andamento fica parado no último passo atingido.
  let current = stepIndexOf(status);
  if (current < 0) {
    current = -1;
    for (const h of sorted) current = Math.max(current, stepIndexOf(h.to_status));
    if (current < 0) current = 0;
  }
  const steps = STEPS.map((s, i) => {
    const at = i === 0 ? (firstAt(s.statuses) ?? createdAt) : firstAt(s.statuses);
    const state: ProgressStep["state"] = i < current ? "done" : i === current ? (s.key === "finalizada" || cancelled ? "done" : "current") : "todo";
    return { key: s.key, label: s.label, hint: s.hint, at: i <= current ? at : null, state };
  });
  return {
    steps,
    cancelled: cancelled ? { at: firstAt(["cancelled", "canceled", "no_show", "rejected"]) } : null
  };
}
