"use client";

import { useCallback, useEffect, useState } from "react";

type Entry =
  | {
      kind: "audit";
      id: string;
      at: string;
      action: string;
      actor_user_id: string | null;
      metadata: Record<string, unknown>;
    }
  | {
      kind: "note";
      id: number;
      at: string;
      author_profile_id: string;
      body: string;
    }
  | {
      kind: "status";
      id: string;
      at: string;
      from_status: string | null;
      to_status: string;
      changed_by: string | null;
      source: string | null;
    }
  | {
      kind: "claim";
      id: string;
      at: string;
      action: "assumed" | "released";
      operator_profile_id: string;
    };

type Props = { tripId: string };

export function OperationalTimelinePanel({ tripId }: Props) {
  const [items, setItems] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/trips/${tripId}/operational-timeline`, { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) {
          setError(json?.error?.message ?? "Não foi possível carregar o histórico.");
          setItems([]);
          return;
        }
        setItems((json.data?.items ?? []) as Entry[]);
      })
      .catch(() => {
        setError("Falha de rede.");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [tripId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Histórico operacional</h2>
      <p className="mt-1 text-xs text-slate-500">
        Auditoria, transições de estado e notas internas, por ordem cronológica inversa.
      </p>
      {loading ? <p className="mt-3 text-sm text-slate-600">A carregar…</p> : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {!loading && !error ? (
        <ul className="mt-3 max-h-80 space-y-3 overflow-y-auto text-sm">
          {items.length === 0 ? (
            <li className="text-slate-500">Sem eventos registados para esta viagem.</li>
          ) : (
            items.map((e) => (
              <li
                key={e.kind === "note" ? `n-${e.id}` : e.id}
                className="border-b border-slate-100 pb-2 last:border-0"
              >
                <p className="font-mono text-xs text-slate-400">
                  {new Date(e.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                </p>
                {e.kind === "audit" ? (
                  <div className="mt-1">
                    <span className="font-medium text-amber-800">{e.action}</span>
                    {e.actor_user_id ? (
                      <span className="ml-2 font-mono text-xs text-slate-500">{e.actor_user_id.slice(0, 8)}…</span>
                    ) : (
                      <span className="ml-2 text-xs text-slate-400">(sistema)</span>
                    )}
                  </div>
                ) : e.kind === "status" ? (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Estado</span>
                    <p className="mt-1 text-slate-800">
                      {e.from_status ?? "—"} → <span className="font-medium">{e.to_status}</span>
                    </p>
                    {e.source ? <p className="mt-1 text-xs text-slate-500">Origem: {e.source}</p> : null}
                  </div>
                ) : e.kind === "claim" ? (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Multiatendimento</span>
                    <p className="mt-1 text-slate-800">
                      {e.action === "assumed" ? "Atendimento assumido" : "Atendimento libertado"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{e.operator_profile_id.slice(0, 8)}…</p>
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Nota interna</span>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{e.body}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{e.author_profile_id.slice(0, 8)}…</p>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}
