import type { InvoiceDetail } from "@/lib/finance/invoice-detail";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

const brl = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brDate = (ymd: string) => ymd.slice(0, 10).split("-").reverse().join("/");
const brDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
const METHOD: Record<string, string> = { boleto: "Boleto bancário", pix: "PIX", transferencia: "Transferência", dinheiro: "Dinheiro", outro: "Outro" };

export function invoiceSituation(d: InvoiceDetail): { label: string; tone: "amber" | "sky" | "red" | "green" | "gray" } {
  const inv = d.invoice;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (inv.status === "paga") return { label: "Pagamento confirmado", tone: "green" };
  if (inv.status === "cancelada") return { label: "Cancelada", tone: "gray" };
  if (inv.due_date < today) return { label: "Vencida", tone: "red" };
  if (inv.status === "aberta") return { label: "Falta enviar ao cliente", tone: "amber" };
  return { label: "Aguardando pagamento", tone: "sky" };
}

const TONE = {
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  sky: "bg-[#FFF4D6] text-[#8A5A00] ring-[#F1D58A]",
  red: "bg-red-50 text-red-800 ring-red-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  gray: "bg-prime-bg text-prime-muted ring-prime-border"
} as const;

/** Visão completa da fatura (status, etapas, serviços e histórico). Interno mostra repasses e margem. */
export function InvoiceOverview({ detail }: { detail: InvoiceDetail }) {
  const inv = detail.invoice;
  const sit = invoiceSituation(detail);
  const allDone = detail.services.length > 0 && detail.services.every((s) => s.status === "completed");
  const steps = [
    { label: "Serviços concluídos", done: allDone },
    { label: "Fatura emitida", done: true },
    { label: "Enviada ao cliente", done: Boolean(inv.sent_at) || inv.status === "enviada" || inv.status === "paga" },
    { label: "Pagamento confirmado", done: inv.status === "paga" }
  ];
  const current = steps.findIndex((s) => !s.done);
  const period = inv.period_start === inv.period_end ? brDate(inv.period_start) : `${brDate(inv.period_start)} a ${brDate(inv.period_end)}`;
  const facts: [string, string][] = [
    ...(inv.client_ref ? ([["Voucher", inv.client_ref]] as [string, string][]) : []),
    ["Serviços", `${detail.services.length || inv.trip_count} atendimento${(detail.services.length || inv.trip_count) > 1 ? "s" : ""}`],
    ["Período", period],
    ["Emissão", brDate(inv.issue_date || inv.created_at)],
    ["Vencimento", brDate(inv.due_date)],
    ["Forma de pagamento", METHOD[inv.payment_method ?? "boleto"] ?? "Boleto bancário"]
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fatura {formatInvoiceNumber(inv.number)}</h1>
          <p className="text-lg text-prime-muted">{detail.client_name}</p>
        </div>
        <span className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${TONE[sit.tone]}`}>{sit.label}</span>
      </div>

      <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
        <div className="border-l-4 border-prime-gold pl-4">
          <p className="text-sm text-prime-muted">Valor total</p>
          <p className="text-4xl font-bold tracking-tight">{brl(inv.total_amount)}</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-b border-prime-border pb-4 sm:grid-cols-3 lg:grid-cols-6">
          {facts.map(([k, v]) => (
            <div key={k} className="lg:border-r lg:border-prime-border lg:pr-3 last:border-r-0">
              <dt className="text-xs text-prime-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <ol className="mt-5 grid grid-cols-4 gap-1">
          {steps.map((s, i) => {
            const isCurrent = i === current;
            return (
              <li key={s.label} className="relative flex flex-col items-center text-center">
                {i > 0 ? (
                  <span className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${steps[i - 1].done ? "bg-prime-gold" : "bg-prime-border"}`} aria-hidden />
                ) : null}
                <span
                  className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    s.done ? "bg-prime-gold text-[#fff]" : isCurrent ? "border-[3px] border-prime-gold bg-white" : "border-2 border-prime-border bg-white"
                  }`}
                >
                  {s.done ? "✓" : isCurrent ? <span className="h-3 w-3 rounded-full bg-prime-gold" /> : ""}
                </span>
                <span className={`mt-2 text-xs sm:text-sm ${isCurrent ? "font-semibold" : s.done ? "" : "text-prime-muted"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
          <h2 className="text-lg font-semibold">Resumo dos serviços</h2>
          <ul className="mt-3 divide-y divide-prime-border">
            {detail.services.map((s) => (
              <li key={s.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-2.5">
                <p className="font-medium">
                  {s.ref ?? `Atendimento ${s.id.slice(0, 8).toUpperCase()}`}{" "}
                  <span className="font-normal text-prime-muted">· {s.when}</span>
                </p>
                <p className="text-right font-semibold">{brl(s.amount)}</p>
                <p className="text-xs text-prime-muted">
                  {s.route} · {s.passenger}
                  {s.km ? ` · ${s.km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : ""}
                </p>
                <p className="text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-prime-bg text-prime-muted"}`}>
                    {s.status === "completed" ? "✓ Concluído" : "Em aberto"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t-2 border-prime-border pt-3">
            <span className="font-semibold">Total dos serviços</span>
            <span className="text-lg font-bold">{brl(inv.total_amount)}</span>
          </div>
        </section>

        <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
          <h2 className="text-lg font-semibold">Histórico</h2>
          <ol className="mt-3 grid gap-0">
            {detail.history.map((h, i) => (
              <li key={`${h.label}-${i}`} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4 last:pb-0">
                {i < detail.history.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-0.5 bg-prime-border" aria-hidden /> : null}
                <span
                  className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${h.done ? "bg-emerald-700 text-[#fff]" : "bg-[#FFF4D6] text-[#8A5A00] ring-2 ring-[#F1D58A]"}`}
                >
                  {h.done ? "✓" : "⏱"}
                </span>
                <span>
                  <span className="block font-semibold">{h.label}</span>
                  <span className="text-sm text-prime-muted">
                    {h.done ? brDateTime(h.at) : h.detail}
                    {h.done && h.detail ? ` · ${h.detail}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {detail.internal ? (
        <section className="rounded-2xl border border-prime-border bg-[linear-gradient(135deg,#111_0%,#2a2418_100%)] p-5 text-[#fff] shadow-prime-card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#C9A84C]">Só a Prime vê · motoristas e margem</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[#C8C3B8]">Motoristas recebem</p>
              {detail.internal.payouts.length ? (
                detail.internal.payouts.map((p, i) => (
                  <p key={i} className="text-sm">
                    <b>{p.driver}</b> · {brl(p.amount)} {p.status === "paid" ? "· pago" : p.due_date ? `em ${brDate(p.due_date)}` : ""}
                  </p>
                ))
              ) : (
                <p className="text-sm text-[#C8C3B8]">Sem repasse (funcionário ou frota)</p>
              )}
            </div>
            <div>
              <p className="text-xs text-[#C8C3B8]">Total de repasse</p>
              <p className="text-2xl font-semibold">{brl(detail.internal.payout_total)}</p>
            </div>
            <div>
              <p className="text-xs text-[#C8C3B8]">Margem da fatura</p>
              <p className="text-2xl font-semibold text-[#C9A84C]">
                {brl(detail.internal.margin)}
                {detail.internal.margin_pct != null ? <span className="ml-2 text-sm text-[#C8C3B8]">{detail.internal.margin_pct.toLocaleString("pt-BR")}%</span> : null}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
