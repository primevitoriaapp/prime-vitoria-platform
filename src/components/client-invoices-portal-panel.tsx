"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { INVOICE_STATUS_LABEL, formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

type Row = {
  id: string;
  number: number;
  period_start: string;
  period_end: string;
  due_date: string;
  trip_count: number;
  total_km: number;
  total_amount: number;
  status: "aberta" | "enviada" | "paga" | "cancelada";
  boleto_url: string | null;
};

const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Portal do gestor: faturas fechadas, com relatório, planilha e boleto (2ª via). */
export function ClientInvoicesPortalPanel({ devFallbackRole = "cliente" }: { devFallbackRole?: "cliente" | "admin" }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/client-invoices", {}, devFallbackRole);
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
      setRows(res.ok && json.success ? (json.data ?? []).filter((r) => r.status !== "cancelada") : []);
    })();
  }, [devFallbackRole]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="grid gap-3">
      <h2 className="font-prime-display text-xl text-prime-text">Faturas</h2>
      <p className="-mt-2 text-sm text-prime-muted">
        Todo mês as corridas são fechadas em uma fatura com o relatório completo: quem usou, de onde, para onde, KM e valor.
      </p>
      {rows === null ? (
        <div className="h-24 animate-pulse rounded-2xl border border-prime-border bg-white" />
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-prime-border bg-white p-6 text-center text-sm text-prime-muted">
          Nenhuma fatura fechada ainda. O resumo do mês atual está na aba Resumo.
        </div>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => {
            const overdue = r.status !== "paga" && r.due_date < today;
            const [y, m] = r.period_start.split("-").map(Number);
            return (
              <li key={r.id} className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">
                      {MONTHS[m - 1]} de {y}
                    </p>
                    <p className="text-xs text-prime-muted">
                      {formatInvoiceNumber(r.number)} · {r.trip_count} corrida{r.trip_count === 1 ? "" : "s"} · {Number(r.total_km).toLocaleString("pt-BR")} km
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-prime-display text-2xl">{brl(r.total_amount)}</p>
                    <p className={`text-xs font-semibold ${r.status === "paga" ? "text-emerald-700" : overdue ? "text-red-700" : "text-prime-muted"}`}>
                      {r.status === "paga" ? "Paga" : overdue ? `Vencida em ${brDate(r.due_date)}` : `${INVOICE_STATUS_LABEL[r.status]} · vence ${brDate(r.due_date)}`}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 border-t border-prime-border pt-3 text-sm">
                  <a href={`/fatura/${r.id}`} className="font-medium text-prime-gold hover:underline">
                    Ver relatório / imprimir
                  </a>
                  <a href={`/api/client-invoices/${r.id}/csv`} className="font-medium text-prime-gold hover:underline">
                    Planilha (Excel)
                  </a>
                  {r.boleto_url && r.status !== "paga" ? (
                    <a href={r.boleto_url} target="_blank" rel="noopener noreferrer" className="font-medium text-prime-gold hover:underline">
                      2ª via do boleto
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
