/** Linha do tempo da corrida (para o gestor do cliente e para a central). Funções puras. */

export type ProgressStep = {
  key: string;
  label: string;
  hint: string;
  at: string | null;
  state: "done" | "current" | "todo";
  /** Ex.: "KM rodado: 34 km". */
  detail?: string | null;
  /** Horário corrigido pela central (só a equipe vê esta marca). */
  edited?: boolean;
};

/** Passos que a central pode corrigir o horário. */
export const EDITABLE_STEPS = ["caminho", "local", "iniciada", "finalizada"] as const;
export type EditableStep = (typeof EDITABLE_STEPS)[number];

const STEPS: { key: string; label: string; hint: string; statuses: string[] }[] = [
  { key: "agendada", label: "Corrida agendada", hint: "Pedido recebido pela Prime", statuses: ["requested"] },
  { key: "preparando", label: "Equipe Prime preparando", hint: "Corrida confirmada, escolhendo o motorista", statuses: ["approved"] },
  { key: "motorista", label: "Motorista atribuído", hint: "Motorista e carro definidos", statuses: ["dispatched", "accepted", "reassigned"] },
  { key: "caminho", label: "Motorista iniciou o deslocamento", hint: "Indo até o local de embarque", statuses: ["on_the_way"] },
  { key: "local", label: "Motorista chegou ao local de embarque", hint: "Aguardando o passageiro", statuses: ["arrived"] },
  { key: "iniciada", label: "Corrida iniciada · passageiro a bordo", hint: "Em viagem", statuses: ["in_progress"] },
  { key: "finalizada", label: "Corrida finalizada", hint: "Chegou ao destino", statuses: ["completed"] }
];

export function stepIndexOf(status: string): number {
  return STEPS.findIndex((s) => s.statuses.includes(status));
}

export type ProgressExtras = {
  /** Horários corrigidos pela central, por passo. */
  overrides?: Partial<Record<EditableStep, string>> | null;
  /** KM rodado (cobrado) para mostrar na finalização. */
  km?: number | null;
  /** Embarques/desembarques confirmados no caminho (entre "iniciada" e "finalizada"). */
  stops?: { label: string; at: string | null }[];
};

/**
 * `history` = mudanças de status (to_status + quando). O primeiro passo usa a criação da corrida.
 * Se a corrida foi direto para um passo adiante (ex.: central já agendou com motorista), os anteriores contam como feitos.
 */
export function buildProgress(
  status: string,
  createdAt: string,
  history: { to_status: string; changed_at: string }[],
  extras: ProgressExtras = {}
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
  const ov = extras.overrides ?? {};
  const steps: ProgressStep[] = [];
  STEPS.forEach((s, i) => {
    const override = (ov as Record<string, string | undefined>)[s.key];
    const raw = i === 0 ? (firstAt(s.statuses) ?? createdAt) : firstAt(s.statuses);
    const at = override ?? raw;
    const state: ProgressStep["state"] = i < current ? "done" : i === current ? (s.key === "finalizada" || cancelled ? "done" : "current") : "todo";
    if (s.key === "finalizada" && extras.stops?.length) {
      extras.stops
        .filter((x) => x.at)
        .sort((a, b) => String(a.at).localeCompare(String(b.at)))
        .forEach((x, k) => steps.push({ key: `parada-${k}`, label: x.label, hint: "", at: x.at, state: "done" }));
    }
    steps.push({
      key: s.key,
      label: s.label,
      hint: s.hint,
      at: i <= current ? at : null,
      state,
      edited: Boolean(override),
      detail: s.key === "finalizada" && state === "done" && !cancelled && extras.km ? `KM rodado: ${extras.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null
    });
  });
  return {
    steps,
    cancelled: cancelled ? { at: firstAt(["cancelled", "canceled", "no_show", "rejected"]) } : null
  };
}
