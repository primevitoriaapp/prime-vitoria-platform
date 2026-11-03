"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";
import type { ProgressStep } from "@/lib/trips/trip-progress";

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Linha do tempo da corrida: agendada → equipe preparando → motorista → a caminho → iniciada → finalizada. */
export function TripProgressTimeline({
  tripId,
  tenantId,
  devFallbackRole = "admin",
  title = "Andamento da corrida"
}: {
  tripId: string;
  tenantId?: string | null;
  devFallbackRole?: "cliente" | "admin" | "operador" | "financeiro";
  title?: string;
}) {
  const [data, setData] = useState<{ steps: ProgressStep[]; cancelled: { at: string | null } | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/progress`, {}, devFallbackRole);
      const json = (await res.json()) as { success?: boolean; data?: typeof data };
      if (res.ok && json.success && json.data) setData(json.data);
    } catch {
      /* sem andamento: não mostra */
    }
  }, [tripId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);
  useTenantTableRefresh(tenantId ?? null, ["trips"], load);

  if (!data) return null;
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-prime-muted">{title}</p>
      <ol className="mt-3">
        {data.steps.map((s, i) => {
          const last = i === data.steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last ? (
                <span className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-0.5 ${s.state === "done" ? "bg-prime-gold" : "bg-gray-200"}`} aria-hidden />
              ) : null}
              <span
                className={`relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  s.state === "done"
                    ? "bg-prime-gold text-[#111]"
                    : s.state === "current"
                      ? "bg-[#111] text-prime-gold ring-4 ring-prime-gold/25"
                      : "border-2 border-gray-200 bg-white"
                }`}
                aria-hidden
              >
                {s.state === "done" ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={`text-sm ${s.state === "todo" ? "text-prime-muted" : "font-semibold text-prime-text"}`}>{s.label}</p>
                  {s.at ? <p className="text-xs text-prime-muted">{when(s.at)}</p> : null}
                </div>
                {s.state === "current" ? <p className="text-xs text-prime-muted">{s.hint}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {data.cancelled ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          Corrida cancelada{data.cancelled.at ? ` em ${when(data.cancelled.at)}` : ""}.
        </p>
      ) : null}
    </section>
  );
}
