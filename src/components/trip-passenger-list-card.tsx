"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Stop = { passenger_name: string; address_text: string; dropped_at?: string | null };
type Data = { required: boolean; stops: Stop[] };

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Na tela da corrida (central): quem embarcou e onde/quando cada um desceu. */
export function TripPassengerListCard({ tripId }: { tripId: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/trips/${tripId}/passenger-list`, {}, "admin")
      .then((r) => r.json())
      .then((j: { data?: Data }) => setD(j.data ?? null))
      .catch(() => undefined);
  }, [tripId]);
  if (!d || (!d.required && !d.stops.length)) return null;
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <h2 className="font-semibold">👥 Lista de passageiros</h2>
      {!d.stops.length ? (
        <p className="mt-2 text-sm text-prime-muted">O motorista informa quem embarcou ao iniciar a viagem.</p>
      ) : (
        <ol className="mt-3 space-y-2 text-sm">
          {d.stops.map((s, i) => (
            <li key={`${s.passenger_name}-${i}`} className="flex items-start justify-between gap-3 rounded-xl bg-prime-bg/60 px-3 py-2">
              <span className="min-w-0">
                <span className="block font-medium">
                  {i + 1}. {s.passenger_name}
                </span>
                <span className="block text-xs text-prime-muted">{s.address_text}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${s.dropped_at ? "text-emerald-700" : "text-prime-muted"}`}>
                {s.dropped_at ? `desceu ${hhmm(s.dropped_at)}` : "a bordo"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
