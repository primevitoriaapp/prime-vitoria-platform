"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { STATUS_LABEL } from "@/lib/operations/booking-periods";

type Row = {
  id: string;
  scheduled_at: string;
  operational_status: string;
  origin_text: string | null;
  destination_text: string | null;
  passenger_name: string | null;
  client_name: string;
  driver_name: string | null;
  client_amount: number | null;
  planned_km: number | null;
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Agenda: corridas que já passaram e ficaram abertas. A central fecha como realizada ou cancelada. */
export function StaleTripsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession("/api/trips/stale", {}, "admin");
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Row[] };
    if (j.success) setRows(j.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function close(r: Row, action: "completed" | "cancelled") {
    const reason = window.prompt(
      action === "completed" ? "Confirma que o serviço foi realizado? Escreva uma observação (ex.: motorista esqueceu de finalizar):" : "Motivo do cancelamento:",
      action === "completed" ? "Motorista esqueceu de finalizar no app" : ""
    );
    if (reason === null || reason.trim().length < 3) return;
    setBusy(r.id);
    const res = await fetchWithSupabaseSession(
      `/api/trips/${r.id}/force-close`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) },
      "admin"
    );
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(null);
    setMsg(j.success ? (action === "completed" ? "Corrida marcada como realizada. Confira o valor dela." : "Corrida cancelada.") : (j.error?.message ?? "Falhou."));
    void load();
  }

  if (!rows.length) return msg ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p> : null;

  return (
    <section id="esquecidas" className="scroll-mt-6 rounded-2xl border-2 border-red-300 bg-red-50/60 p-4">
      <h2 className="text-base font-semibold text-red-900">⚠ {rows.length} corrida(s) que já passaram e ninguém finalizou</h2>
      <p className="mt-1 text-sm text-red-900/80">Enquanto ficam abertas, não entram no financeiro e o motorista aparece como ocupado. Feche cada uma.</p>
      {msg ? <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm">{msg}</p> : null}
      <ul className="mt-3 grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm shadow-sm">
            <Link href={`/agenda?trip=${r.id}#trip-detail` as Route} className="min-w-0 flex-1 hover:underline">
              <span className="font-semibold">{when(r.scheduled_at)}</span> · {r.client_name}
              <span className="block truncate text-xs text-prime-muted">
                {String(r.origin_text ?? "").split(",")[0]} → {String(r.destination_text ?? "").split(",")[0]} · {r.driver_name ?? "sem motorista"} · {STATUS_LABEL[r.operational_status] ?? r.operational_status}
                {!r.client_amount ? " · sem valor" : ""}
              </span>
            </Link>
            <span className="flex gap-2">
              <button type="button" disabled={busy === r.id} onClick={() => void close(r, "completed")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-[#fff] disabled:opacity-50">
                Foi realizada
              </button>
              <button type="button" disabled={busy === r.id} onClick={() => void close(r, "cancelled")} className="rounded-lg px-3 py-1.5 text-xs text-red-700 ring-1 ring-red-200 disabled:opacity-50">
                Cancelar
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
