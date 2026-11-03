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
const todaySp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const payday = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

/** Soma os repasses pela data prevista de pagamento (liberados primeiro). */
function groupByPayday(items: Item[]) {
  const map = new Map<string, { day: string | null; total: number; items: Item[] }>();
  for (const i of items) {
    const key = i.due_date ?? "";
    const g = map.get(key) ?? { day: i.due_date, total: 0, items: [] };
    g.total += i.amount;
    g.items.push(i);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => String(a.day ?? "9999").localeCompare(String(b.day ?? "9999")));
}

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
  if (w.funcionario) return <div className={`${card} text-sm text-[#6B6F76]`}>Você é motorista contratado da Prime: seu pagamento é o salário combinado, por isso os valores das corridas não aparecem aqui.</div>;

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
          Liberado para pagar{w.pix_key ? ` · cai no PIX ${w.pix_key}` : " · cadastre seu PIX em Perfil"}
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
          <p className="mt-2 text-sm text-[#6B6F76]">Nada pendente agora.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {groupByPayday(proximos).map((g) => {
              const late = g.day != null && g.day < todaySp() && g.items.some((i) => i.stage === "aguardando");
              return (
                <div key={g.day ?? "sem-data"} className="rounded-2xl border border-[#F0ECE3]">
                  <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-[#FBF6EA] px-3 py-2.5">
                    <span>
                      <span className="block text-xs uppercase tracking-wide text-[#8A6A1F]">Pagamento previsto</span>
                      <span className="text-sm font-semibold">{g.day ? payday(g.day) : "A definir"}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-bold">{brl(g.total)}</span>
                      <span className="text-xs text-[#6B6F76]">{g.items.length} corrida(s)</span>
                    </span>
                  </div>
                  {late ? (
                    <p className="px-3 pt-2 text-xs font-medium text-[#8A5A00]">O cliente ainda não pagou: a data muda quando o pagamento entrar.</p>
                  ) : null}
                  <ul className="divide-y divide-[#F0ECE3] px-3">
                    {g.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-sm">
                            {d(i.trip_at)} · {i.route}
                          </span>
                          <span className={`text-xs ${i.stage === "liberado" ? "font-semibold text-[#1F7A4C]" : "text-[#6B6F76]"}`}>
                            {i.stage === "liberado" ? "Cliente já pagou · liberado" : "Aguardando o cliente pagar a Prime"}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold">{brl(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={card}>
        <h3 className="text-base font-semibold">Já recebidos</h3>
        {pagos.length === 0 ? (
          <p className="mt-2 text-sm text-[#6B6F76]">Nenhum repasse pago ainda.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#F0ECE3]">
            {pagos.slice(0, 30).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {d(i.trip_at)} · {i.route}
                  </span>
                  <span className="text-xs text-[#6B6F76]">Pago em {d(i.paid_at)}</span>
                </span>
                <span className="shrink-0 font-semibold text-[#1F7A4C]">{brl(i.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="px-2 text-center text-xs text-[#6B6F76]">
        A data prevista segue o fechamento e o prazo de cada empresa. A Prime paga o repasse depois que o cliente paga: se o cliente atrasar, o repasse atrasa junto.
      </p>
    </div>
  );
}
