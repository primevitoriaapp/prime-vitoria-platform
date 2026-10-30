"use client";

import { useEffect, useState } from "react";

type Item = { id: string; amount: number; trip_at: string | null; route: string; stage: "pago" | "liberado" | "aguardando"; due_date: string | null; paid_at: string | null };
type Wallet = {
  funcionario: boolean;
  pix_key?: string | null;
  summary?: { hoje: number; mes: number; corridas_mes: number; previsto: number; liberado: number; aguardando_cliente: number; pago: number };
  items?: Item[];
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "—");
const card = "rounded-3xl border border-[#ECE7DB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]";

/** Carteira do motorista: quanto vai receber, o que já está liberado e o que já caiu. */
export function DriverWallet() {
  const [w, setW] = useState<Wallet | null>(null);
  useEffect(() => {
    void fetch("/api/drivers/me/wallet", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Wallet }) => j.success && j.data && setW(j.data))
      .catch(() => undefined);
  }, []);

  if (!w) return <div className={`${card} h-40 animate-pulse`} />;
  if (w.funcionario) return <div className={`${card} text-sm text-[#8A8A8A]`}>Você é motorista contratado da Prime: seu pagamento é o salário combinado, por isso os valores das corridas não aparecem aqui.</div>;

  const s = w.summary!;
  const items = w.items ?? [];
  const proximos = items.filter((i) => i.stage !== "pago").sort((a, b) => (a.stage === b.stage ? String(a.trip_at).localeCompare(String(b.trip_at)) : a.stage === "liberado" ? -1 : 1));
  const pagos = items.filter((i) => i.stage === "pago").sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#111] p-5 text-[#fff]">
        <p className="text-xs uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.6)" }}>
          Próximo recebimento
        </p>
        <p className="mt-1 text-4xl font-bold text-prime-gold">{brl(s.liberado)}</p>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          Liberado para pagar{w.pix_key ? ` · cai no PIX ${w.pix_key}` : " · cadastre seu PIX com a central"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-white/10 p-3">
            <p style={{ color: "rgba(255,255,255,0.6)" }}>Aguardando cliente</p>
            <p className="text-lg font-semibold" style={{ color: "#fff" }}>
              {brl(s.aguardando_cliente)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p style={{ color: "rgba(255,255,255,0.6)" }}>Ganhos no mês</p>
            <p className="text-lg font-semibold" style={{ color: "#fff" }}>
              {brl(s.mes)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
          {s.corridas_mes} corrida(s) no mês · hoje {brl(s.hoje)}
          {s.previsto ? ` · agendado ${brl(s.previsto)}` : ""}
        </p>
      </section>

      <section className={card}>
        <h3 className="text-base font-semibold">Próximos recebimentos</h3>
        {proximos.length === 0 ? (
          <p className="mt-2 text-sm text-[#8A8A8A]">Nada pendente agora.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#F0ECE3]">
            {proximos.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {d(i.trip_at)} · {i.route}
                  </span>
                  <span className={`text-xs ${i.stage === "liberado" ? "font-semibold text-[#1F7A4C]" : "text-[#8A8A8A]"}`}>
                    {i.stage === "liberado" ? "Liberado · será pago no próximo repasse" : "Aguardando o cliente pagar a Prime"}
                  </span>
                </span>
                <span className="shrink-0 font-bold">{brl(i.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="text-base font-semibold">Já recebidos</h3>
        {pagos.length === 0 ? (
          <p className="mt-2 text-sm text-[#8A8A8A]">Nenhum repasse pago ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#F0ECE3]">
            {pagos.slice(0, 30).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {d(i.trip_at)} · {i.route}
                  </span>
                  <span className="text-xs text-[#8A8A8A]">Pago em {d(i.paid_at)}</span>
                </span>
                <span className="shrink-0 font-semibold text-[#1F7A4C]">{brl(i.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="px-2 text-center text-xs text-[#8A8A8A]">A Prime paga o repasse depois que o cliente paga a corrida.</p>
    </div>
  );
}
