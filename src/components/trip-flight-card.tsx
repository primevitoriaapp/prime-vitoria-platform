"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { flightTrackerUrl } from "@/lib/trips/flight";
import { flightStatusLabel, isFlightProblem } from "@/lib/integrations/flight-status";

type T = {
  flight_number?: string | null;
  flight_status?: string | null;
  flight_scheduled_at?: string | null;
  flight_eta?: string | null;
  flight_delay_minutes?: number | null;
  flight_leg?: string | null;
  flight_airport?: string | null;
  flight_checked_at?: string | null;
  flight_error?: string | null;
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Quadro do voo na tela da corrida: previsto x atualizado, situação e botão "Atualizar voo". */
export function TripFlightCard({ tripId }: { tripId: string }) {
  const [t, setT] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}`, {}, "admin");
    const json = (await res.json().catch(() => ({}))) as { data?: T };
    setT(json.data ?? null);
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!t?.flight_number) return null;

  const problem = isFlightProblem(t.flight_status);
  const delay = t.flight_delay_minutes ?? 0;
  const verb = t.flight_leg === "departure" ? "Decolagem" : "Pouso";

  async function refresh() {
    setBusy(true);
    setMsg(null);
    const res = await fetchWithSupabaseSession(`/api/trips/${tripId}/flight-check`, { method: "POST" }, "admin");
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !json.success) setMsg(json.error?.message ?? "Não foi possível consultar agora.");
    await load();
  }

  return (
    <section
      className={`rounded-2xl border bg-white p-4 shadow-prime-card ${problem || delay >= 15 ? "border-red-300" : "border-prime-border"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          ✈ Voo {t.flight_number}
          {t.flight_airport ? <span className="font-normal text-prime-muted"> · {t.flight_airport}</span> : null}
        </h2>
        <div className="flex items-center gap-2">
          <a href={flightTrackerUrl(t.flight_number)} target="_blank" rel="noreferrer" className="text-sm text-prime-muted underline">
            Ver no mapa
          </a>
          <button type="button" onClick={() => void refresh()} disabled={busy} className="rounded-xl border border-prime-border px-3 py-1.5 text-sm font-semibold hover:border-prime-gold disabled:opacity-60">
            {busy ? "Consultando…" : "Atualizar voo"}
          </button>
        </div>
      </div>
      {t.flight_checked_at && t.flight_scheduled_at ? (
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-prime-muted">Situação</p>
            <p className={`font-semibold ${problem ? "text-red-700" : ""}`}>{flightStatusLabel(t.flight_status)}</p>
          </div>
          <div>
            <p className="text-xs text-prime-muted">{verb} previsto na passagem</p>
            <p className="font-semibold">{hhmm(t.flight_scheduled_at)}</p>
          </div>
          <div>
            <p className="text-xs text-prime-muted">{verb} atualizado</p>
            <p className={`font-semibold ${delay >= 15 ? "text-red-700" : ""}`}>
              {t.flight_eta ? hhmm(t.flight_eta) : "-"}
              {delay >= 5 ? ` (+${delay} min)` : delay <= -10 ? ` (adiantado ${-delay} min)` : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-prime-muted">
          {t.flight_error ?? "O voo é conferido sozinho a partir de 6 horas antes da corrida, enquanto o painel estiver aberto."}
        </p>
      )}
      {problem || delay >= 15 ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
          O horário do voo mudou. Se precisar, ajuste o horário da corrida em “Editar corrida” — o motorista recebe a O.S. atualizada.
        </p>
      ) : null}
      {t.flight_checked_at ? (
        <p className="mt-2 text-xs text-prime-muted">Última consulta: {hhmm(t.flight_checked_at)}</p>
      ) : null}
      {msg ? <p className="mt-2 text-sm text-red-700">{msg}</p> : null}
    </section>
  );
}
