"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Inv = {
  id: string;
  number: number;
  client_ref?: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  trip_count: number;
  total_amount: number;
  status: "aberta" | "enviada" | "paga" | "cancelada";
  nf_path?: string | null;
  boleto_path?: string | null;
  charge_method?: string | null;
  paid_at?: string | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (ymd: string) => ymd.split("-").reverse().join("/");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Faturas de UM cliente: o que falta enviar, o que está a receber e o que já foi pago. */
export function ClientInvoicesMini({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Inv[] | null>(null);
  useEffect(() => {
    setRows(null);
    void fetchWithSupabaseSession(`/api/client-invoices?client_id=${clientId}`, {}, "admin")
      .then((r) => r.json())
      .then((j) => setRows(j?.success ? (j.data as Inv[]) : []))
      .catch(() => setRows([]));
  }, [clientId]);
  if (rows === null) return <div className="h-24 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  const live = rows.filter((r) => r.status !== "cancelada");
  const groups: [string, Inv[], string][] = [
    ["Falta enviar", live.filter((r) => r.status === "aberta"), "text-red-700"],
    ["Enviadas · a receber", live.filter((r) => r.status === "enviada").sort((a, b) => a.due_date.localeCompare(b.due_date)), "text-sky-800"],
    ["Pagas (últimas)", live.filter((r) => r.status === "paga").slice(0, 6), "text-emerald-700"]
  ];
  return (
    <section className="grid gap-3 rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card print:hidden">
      <h3 className="font-semibold">Faturas deste cliente</h3>
      {!live.length ? <p className="text-sm text-prime-muted">Nenhuma fatura ainda.</p> : null}
      <div className="grid gap-3 lg:grid-cols-3">
        {groups.map(([title, list, tone]) => (
          <div key={title} className="grid content-start gap-2 rounded-xl bg-prime-bg p-3">
            <p className={`text-sm font-semibold ${tone}`}>
              {title} <span className="text-prime-muted">({list.length})</span>
            </p>
            {!list.length ? <p className="text-xs text-prime-muted">Nada aqui.</p> : null}
            {list.map((v) => {
              const late = v.status === "enviada" && v.due_date < today();
              const missing = v.status === "aberta" ? [!v.nf_path ? "nota" : null, v.charge_method !== "pix" && !v.boleto_path ? "boleto/PIX" : null].filter(Boolean) : [];
              return (
                <a key={v.id} href={`/finance/faturas/${v.id}`} className="grid gap-0.5 rounded-lg bg-white p-2.5 text-sm ring-1 ring-prime-border hover:ring-prime-gold">
                  <span className="flex justify-between gap-2">
                    <b>nº {v.number}</b>
                    <b className="tabular-nums">{brl(Number(v.total_amount))}</b>
                  </span>
                  <span className="truncate text-xs text-prime-muted">
                    {v.client_ref || (v.period_start === v.period_end ? br(v.period_start) : `${br(v.period_start)} a ${br(v.period_end)}`)} · {v.trip_count} serviço(s)
                  </span>
                  <span className={`text-xs ${late ? "font-semibold text-red-700" : "text-prime-muted"}`}>
                    {v.status === "paga" ? `Paga${v.paid_at ? ` em ${br(String(v.paid_at).slice(0, 10))}` : ""}` : `${late ? "VENCIDA em" : "Vence"} ${br(v.due_date)}`}
                  </span>
                  {missing.length ? <span className="text-xs font-semibold text-amber-700">Falta: {missing.join(" e ")}</span> : null}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
