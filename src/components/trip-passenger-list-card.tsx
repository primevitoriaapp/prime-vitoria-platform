"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Data = { required: boolean; saved: boolean; boarded: { passenger_id: string | null; passenger_name: string }[] };

/** Na tela da corrida (central): quem o motorista marcou que embarcou. */
export function TripPassengerListCard({ tripId }: { tripId: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    void fetchWithSupabaseSession(`/api/trips/${tripId}/passenger-list`, {}, "admin")
      .then((r) => r.json())
      .then((j: { data?: Data }) => setD(j.data ?? null))
      .catch(() => undefined);
  }, [tripId]);
  if (!d || (!d.required && !d.saved)) return null;
  return (
    <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
      <h2 className="font-semibold">👥 Quem embarcou</h2>
      {!d.saved ? (
        <p className="mt-2 text-sm text-prime-muted">O motorista marca quem embarcou ao iniciar a viagem.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {d.boarded.map((p, i) => (
            <li key={`${p.passenger_name}-${i}`} className="rounded-xl bg-prime-bg/60 px-3 py-2 font-medium">
              ✓ {p.passenger_name}
              {!p.passenger_id ? <span className="ml-1 text-xs font-normal text-prime-muted">(fora da lista da empresa)</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
