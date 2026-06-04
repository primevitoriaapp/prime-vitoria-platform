"use client";

import { useMemo } from "react";
import type { Trip } from "@/lib/domain/types";
import { PRIME_SURFACE_CARD } from "@/lib/ui/prime-surface-card";

type Props = {
  trips: Trip[];
};

/** Lista derivada de passageiros nas corridas (read-only, sem API nova). */
export function ClientPassengersPanel({ trips }: Props) {
  const passengers = useMemo(() => {
    const m = new Map<string, { name: string; count: number; lastAt: string }>();
    for (const t of trips) {
      const name = t.passenger_name?.trim() || "Sem nome";
      const prev = m.get(name);
      const at = t.scheduled_at;
      if (!prev) {
        m.set(name, { name, count: 1, lastAt: at });
      } else {
        prev.count += 1;
        if (new Date(at) > new Date(prev.lastAt)) prev.lastAt = at;
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [trips]);

  return (
    <section id="passageiros" className="space-y-3">
      <h2 className="font-serif text-lg text-prime-text">Passageiros</h2>
      <div className={PRIME_SURFACE_CARD}>
        {passengers.length === 0 ? (
          <p className="text-sm text-prime-muted">Nenhum passageiro nas corridas listadas.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {passengers.map((p) => (
              <li key={p.name} className="flex justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="font-medium text-prime-text">{p.name}</span>
                <span className="shrink-0 text-xs text-prime-muted">
                  {p.count} corrida{p.count === 1 ? "" : "s"} · última{" "}
                  {new Date(p.lastAt).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-prime-muted">Agregado a partir do histórico de viagens (sem cadastro separado).</p>
    </section>
  );
}
