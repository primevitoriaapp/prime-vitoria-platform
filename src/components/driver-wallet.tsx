"use client";

import { useEffect, useState } from "react";

type Item = { id: string; amount: number; trip_at: string | null; route: string; stage: "pago" | "liberado" | "aguardando"; due_date: string | null; paid_at: string | null; proof_url?: string | null };
type Rank = { month: string; trips: number; position: number | null; of: number; punctuality: number | null; categories?: string[] };
type Wallet = {
  funcionario: boolean;
  via_partner?: string | null;
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

const card = "rounded-[20px] bg-white p-5 shadow-[0_4px_16px_rgba(0,0,0,0.05)]";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B6F76" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition ${open ? "rotate-90" : ""}`} aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function RowIcon({ d }: { d: string }) {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F6F3EC]">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B5F66" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </span>
  );
}

/** Carteira do motorista: quanto vai receber, o que já está liberado e o que já caiu. */
export function DriverWallet() {
  const [w, setW] = useState<Wallet | null>(null);
  const [rank, setRank] = useState<Rank | null>(null);
  const [open, setOpen] = useState<"proximos" | "pagos" | null>(null);
  useEffect(() => {
    void fetch("/api/drivers/me/wallet", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Wallet }) => j.success && j.data && setW(j.data))
      .catch(() => undefined);
    void fetch("/api/drivers/me/ranking", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Rank }) => j.success && j.data && setRank(j.data))
      .catch(() => undefined);
  }, []);

  if (!w) return <div className={`${card} h-40 animate-pulse`} />;
  if (w.funcionario)
    return (
      <div className="space-y-4">
        <div className={`${card} text-sm text-[#6B6F76]`}>
          {w.via_partner
            ? `Você dirige pela ${w.via_partner}: o pagamento das corridas é feito pela ${w.via_partner}, por isso os valores não aparecem aqui.`
            : "Você é motorista contratado da Prime: seu pagamento é o salário combinado, por isso os valores das corridas não aparecem aqui."}
        </div>
        {rank ? <RankCard rank={rank} /> : null}
      </div>
    );

  const s = w.summary!;
  const items = w.items ?? [];
  const proximos = items.filter((i) => i.stage !== "pago").sort((a, b) => (a.stage === b.stage ? String(a.trip_at).localeCompare(String(b.trip_at)) : a.stage === "liberado" ? -1 : 1));
  const pagos = items.filter((i) => i.stage === "pago").sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
  const groups = groupByPayday(proximos);
  const next = groups[0];
  const heroAmount = s.liberado > 0 ? s.liberado : next?.total ?? 0;
  const heroSub = s.liberado > 0 ? "Liberado: o cliente já pagou" : next?.day ? `Previsto para ${payday(next.day)}` : "Nada a receber agora";
  const nowMonth = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const monthOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7) : "");
  const pagosMes = pagos.filter((i) => monthOf(i.paid_at) === nowMonth);
  const recebidoMes = pagosMes.reduce((n, i) => n + i.amount, 0);
  const temAReceber = heroAmount > 0;
  const pixTail = w.pix_key ? String(w.pix_key).replace(/\s/g, "").slice(-4) : null;
  const lastPaid = pagos[0];

  return (
    <div className="space-y-3">
      <section className="rounded-[24px] bg-white p-5 shadow-[0_6px_20px_rgba(0,0,0,0.06)]">
        <p className="text-[13px] font-semibold text-[#5C6067]">{temAReceber ? (s.liberado > 0 ? "Liberado para receber" : "A receber") : "Já recebido este mês"}</p>
        <p className="mt-1 text-[40px] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-[#111]">{brl(temAReceber ? heroAmount : recebidoMes)}</p>
        <div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold ${temAReceber ? "bg-[#E7F6EC] text-[#11461F]" : "bg-[#F1EFEA] text-[#5C6067]"}`}>
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 7h16v13H4zM4 11h16M9 3v4M15 3v4" /></svg>
          {temAReceber ? (next?.day && s.liberado <= 0 ? `Próximo PIX: ${payday(next.day)}` : heroSub) : recebidoMes > 0 ? `Último em ${d(lastPaid?.paid_at ?? null)}` : "Nada a receber agora"}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-[#EFEBE2] pt-3.5">
          <div>
            <p className="text-xs font-semibold text-[#5C6067]">Já recebido no mês</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums">{brl(recebidoMes)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#5C6067]">Corridas no mês</p>
            <p className="mt-0.5 text-lg font-extrabold tabular-nums">{s.corridas_mes}</p>
          </div>
        </div>
        {s.aguardando_cliente > 0 ? <p className="mt-2 text-xs font-semibold text-[#8A5A00]">{brl(s.aguardando_cliente)} aguardando o cliente pagar a Prime</p> : null}
      </section>

      <div className="flex items-center justify-between rounded-[18px] bg-white px-4 py-3.5">
        <span className="text-sm">
          <span className="text-[#5C6067]">Recebo no PIX</span>
          <br />
          <b>{pixTail ? `Chave final ${pixTail}` : "Nenhuma chave cadastrada"}</b>
        </span>
        <span className="text-[13px] font-semibold text-[#8A6A1F]">{pixTail ? "Trocar em Perfil" : "Cadastre em Perfil"}</span>
      </div>

      {rank ? <RankCard rank={rank} /> : null}

      <section className={`${card} !p-0`}>
        <button type="button" onClick={() => setOpen(open === "proximos" ? null : "proximos")} className="flex w-full items-center gap-3 p-4 text-left">
          <RowIcon d="M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 7v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Próximos recebimentos</span>
            <span className="block truncate text-sm text-[#6B6F76]">
              {proximos.length ? `${proximos.length} corrida(s) · ${brl(proximos.reduce((t, i) => t + i.amount, 0))}` : "Nada pendente agora."}
            </span>
          </span>
          <Chevron open={open === "proximos"} />
        </button>
        {open === "proximos" && proximos.length ? (
          <div className="space-y-3 px-4 pb-4">
            {groups.map((g) => {
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
                  {late ? <p className="px-3 pt-2 text-xs font-medium text-[#8A5A00]">O cliente ainda não pagou: a data muda quando o pagamento entrar.</p> : null}
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
        ) : null}
      </section>

      <section className={`${card} !p-0`}>
        <button type="button" onClick={() => setOpen(open === "pagos" ? null : "pagos")} className="flex w-full items-center gap-3 p-4 text-left">
          <RowIcon d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">Já recebidos</span>
            <span className="block truncate text-sm text-[#6B6F76]">
              {lastPaid ? `Último: ${brl(lastPaid.amount)} em ${d(lastPaid.paid_at)} · comprovantes aqui` : "Nenhum repasse pago ainda."}
            </span>
          </span>
          <Chevron open={open === "pagos"} />
        </button>
        {open === "pagos" && pagos.length ? (
          <ul className="divide-y divide-[#F0ECE3] px-4 pb-3">
            {pagos.slice(0, 40).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {d(i.trip_at)} · {i.route}
                  </span>
                  <span className="text-xs text-[#6B6F76]">
                    Pago em {d(i.paid_at)}
                    {i.proof_url ? (
                      <>
                        {" · "}
                        <a href={i.proof_url} target="_blank" rel="noreferrer" className="font-semibold text-[#8A6A1F] underline">
                          ver comprovante
                        </a>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-[#1F7A4C]">{brl(i.amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="px-2 text-center text-xs text-[#6B6F76]">
        A data prevista segue o fechamento e o prazo de cada empresa. A Prime paga o repasse depois que o cliente paga: se o cliente atrasar, o repasse atrasa junto.
      </p>
    </div>
  );
}

/** Só os números do próprio motorista e a posição: nunca os dos outros. */
function RankCard({ rank }: { rank: Rank }) {
  const medal = rank.position === 1 ? "🥇" : rank.position === 2 ? "🥈" : rank.position === 3 ? "🥉" : "🏁";
  return (
    <section className={`${card} !p-4`}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FBF3E0] text-2xl">{medal}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[#6B6F76]">Seu mês de {rank.month}</p>
          <p className="text-base font-semibold">
            {rank.trips} corrida(s){rank.position ? ` · ${rank.position}º lugar` : ""}
          </p>
        </div>
        {rank.punctuality != null ? (
          <div className="text-right">
            <p className="text-xs text-[#6B6F76]">Pontualidade</p>
            <p className={`text-lg font-bold ${rank.punctuality >= 90 ? "text-[#1F7A4C]" : rank.punctuality >= 75 ? "text-[#8A6A1F]" : "text-red-700"}`}>{rank.punctuality}%</p>
          </div>
        ) : null}
      </div>
      {rank.categories?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {rank.categories.map((c) => (
            <span key={c} className="rounded-full bg-[#111] px-2.5 py-1 text-xs font-semibold text-prime-gold">
              {c}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-[#6B6F76]">
        {rank.position ? `Entre ${rank.of} motoristas com corridas no mês. ` : "Faça sua primeira corrida do mês para entrar no ranking. "}
        Pontual = marcou “Cheguei” até 5 min depois do horário.
      </p>
    </section>
  );
}
