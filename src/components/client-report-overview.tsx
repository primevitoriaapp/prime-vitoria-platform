"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Row = {
  client_id: string;
  name: string;
  type: string;
  trips: number;
  done: number;
  total: number;
  to_approve: number;
  unbilled: number;
  billed: number;
  a_enviar: number;
  a_receber: number;
  a_receber_total: number;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Visão geral do mês: um card por cliente com o que foi feito, o que falta fechar e o que falta receber. */
export function ClientReportOverview({ month, onPick }: { month: string; onPick: (clientId: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    setRows(null);
    void fetchWithSupabaseSession(`/api/clients/report-overview?month=${month}`, {}, "admin")
      .then((r) => r.json())
      .then((j) => setRows(j?.success ? (j.data.clients as Row[]) : []))
      .catch(() => setRows([]));
  }, [month]);

  if (rows === null) return <div className="h-40 animate-pulse rounded-2xl border border-prime-border bg-white" />;
  const list = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Clientes atendidos", String(rows.length)],
          ["Total do mês", brl(sum("total"))],
          ["Falta fechar (sem fatura)", brl(sum("unbilled"))],
          ["Faturado a receber", brl(sum("a_receber_total"))]
        ].map(([k, v], i) => (
          <div key={k} className={`rounded-2xl p-4 ${i === 1 ? "bg-[#111] text-[#fff]" : "border border-prime-border bg-white"}`}>
            <p className={`text-xs ${i === 1 ? "text-[#C8C3B8]" : "text-prime-muted"}`}>{k}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cliente…"
        className="w-full rounded-xl border border-prime-border bg-white px-3 py-2 text-sm sm:max-w-sm"
      />
      {!list.length ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-10 text-center text-sm text-prime-muted">Nenhuma corrida neste mês.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <button
              key={r.client_id}
              type="button"
              onClick={() => onPick(r.client_id)}
              className="grid gap-2 rounded-2xl border border-prime-border bg-white p-4 text-left shadow-prime-card transition hover:border-prime-gold"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="text-xs text-prime-muted">
                    {r.done} concluída(s){r.trips > r.done ? ` · ${r.trips - r.done} a fazer` : ""}
                    {r.type === "PF" ? " · pessoa física" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-bold tabular-nums">{brl(r.total)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                {r.to_approve ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{r.to_approve} a aprovar</span> : null}
                {r.unbilled > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{brl(r.unbilled)} a fechar</span> : null}
                {r.a_enviar ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">{r.a_enviar} fatura(s) a enviar</span> : null}
                {r.a_receber ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-800">{brl(r.a_receber_total)} a receber</span> : null}
                {!r.to_approve && r.unbilled <= 0 && !r.a_enviar && !r.a_receber ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">✓ Tudo em dia</span> : null}
              </div>
              <span className="text-xs font-semibold text-prime-gold-ink">Ver corridas e faturas →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
