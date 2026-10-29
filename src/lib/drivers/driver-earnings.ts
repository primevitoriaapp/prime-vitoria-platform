/** Resumo de ganhos do parceiro (regras puras). */
export type EarningTrip = { scheduled_at: string; driver_amount: number | string | null; operational_status: string };
export type EarningPayable = { amount: number | string | null; status: string; receivable_status?: string | null };

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

function spDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function summarizeDriverEarnings(trips: EarningTrip[], payables: EarningPayable[], now: Date = new Date()) {
  const today = spDay(now.toISOString());
  const month = today.slice(0, 7);
  let hoje = 0;
  let mes = 0;
  let corridasMes = 0;
  let previsto = 0;
  for (const t of trips) {
    const day = spDay(t.scheduled_at);
    if (t.operational_status === "completed") {
      if (day === today) hoje += n(t.driver_amount);
      if (day.slice(0, 7) === month) {
        mes += n(t.driver_amount);
        corridasMes += 1;
      }
    } else if (!["cancelled", "rejected", "no_show"].includes(t.operational_status) && new Date(t.scheduled_at) >= new Date(now.getTime() - 6 * 3600_000)) {
      previsto += n(t.driver_amount);
    }
  }
  let pago = 0;
  let liberado = 0;
  let aguardandoCliente = 0;
  for (const p of payables) {
    if (p.status === "paid") pago += n(p.amount);
    else if (p.status === "cancelled") continue;
    else if (p.receivable_status === "paid") liberado += n(p.amount);
    else aguardandoCliente += n(p.amount);
  }
  return {
    hoje: r2(hoje),
    mes: r2(mes),
    corridas_mes: corridasMes,
    previsto: r2(previsto),
    a_receber: r2(liberado + aguardandoCliente),
    liberado: r2(liberado),
    aguardando_cliente: r2(aguardandoCliente),
    pago: r2(pago)
  };
}
