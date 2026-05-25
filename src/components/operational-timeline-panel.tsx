"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { notificationTimelineTitle } from "@/lib/trips/timeline-notification";
import { timelineAuditLabel, timelineMetadataSummary } from "@/lib/trips/timeline-present";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

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
    }
  | {
      kind: "notification";
      id: string;
      at: string;
      event_type: string;
      channel: string;
      recipient_type: string;
      recipient_id: string | null;
      status: string;
      correlation_id: string;
      last_error: string | null;
    };

type AuditFilter = "" | "finance." | "trip.";

type Props = {
  tripId: string;
  devFallbackRole?: "operador" | "admin" | "financeiro";
};

function profileLabel(id: string | null, names: Record<string, string>): string {
  if (!id) return "(sistema)";
  return names[id]?.trim() || `${id.slice(0, 8)}…`;
}

export function OperationalTimelinePanel({ tripId, devFallbackRole = "operador" }: Props) {
  const [items, setItems] = useState<Entry[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (auditFilter) qs.set("audit_prefix", auditFilter);
    const path = `/api/trips/${tripId}/operational-timeline${qs.toString() ? `?${qs}` : ""}`;
    try {
      const r = await fetchWithSupabaseSession(path, {}, devFallbackRole);
      const json = (await r.json()) as {
        success?: boolean;
        data?: { items: Entry[]; profile_names?: Record<string, string> };
        error?: { message?: string };
      };
      if (!json?.success) {
        setError(json?.error?.message ?? "Não foi possível carregar o histórico.");
        setItems([]);
        return;
      }
      setItems((json.data?.items ?? []) as Entry[]);
      setProfileNames((json.data?.profile_names ?? {}) as Record<string, string>);
    } catch {
      setError("Falha de rede.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tripId, auditFilter, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Histórico operacional</h2>
          <p className="mt-1 text-xs text-slate-500">
            Auditoria, transições de estado e notas internas, por ordem cronológica inversa.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <span className="self-center text-slate-500">Auditoria:</span>
          {(
            [
              ["", "Tudo"],
              ["finance.", "Financeiro"],
              ["trip.", "Viagem"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setAuditFilter(value)}
              className={`rounded border px-2 py-0.5 ${
                auditFilter === value ? "border-amber-600 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <ul className="mt-3 animate-pulse space-y-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-10 rounded bg-slate-100" />
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => void load()} className="text-sm font-medium text-amber-800 underline">
            Tentar novamente
          </button>
        </div>
      ) : null}
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
                    <span className="font-medium text-amber-800">{timelineAuditLabel(e.action)}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">{e.action}</span>
                    <span className="ml-2 text-xs text-slate-500">{profileLabel(e.actor_user_id, profileNames)}</span>
                    {timelineMetadataSummary(e.metadata) ? (
                      <p className="mt-1 text-xs text-slate-500">{timelineMetadataSummary(e.metadata)}</p>
                    ) : null}
                  </div>
                ) : e.kind === "status" ? (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Estado</span>
                    <p className="mt-1 text-slate-800">
                      {e.from_status && e.from_status in STATUS_CORRIDA_PT
                        ? STATUS_CORRIDA_PT[e.from_status as keyof typeof STATUS_CORRIDA_PT]
                        : (e.from_status ?? "—")}{" "}
                      →{" "}
                      <span className="font-medium">
                        {e.to_status in STATUS_CORRIDA_PT
                          ? STATUS_CORRIDA_PT[e.to_status as keyof typeof STATUS_CORRIDA_PT]
                          : e.to_status}
                      </span>
                    </p>
                    {e.source ? <p className="mt-1 text-xs text-slate-500">Origem: {e.source}</p> : null}
                  </div>
                ) : e.kind === "claim" ? (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Multiatendimento</span>
                    <p className="mt-1 text-slate-800">
                      {e.action === "assumed" ? "Atendimento assumido" : "Atendimento libertado"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{profileLabel(e.operator_profile_id, profileNames)}</p>
                  </div>
                ) : e.kind === "notification" ? (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Notificação</span>
                    <p className="mt-1 text-slate-800">{notificationTimelineTitle({ eventType: e.event_type, channel: e.channel }, e.status)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {e.recipient_type}
                      {e.recipient_id ? ` ${e.recipient_id.slice(0, 8)}…` : ""} · {e.correlation_id}
                    </p>
                    {e.last_error ? <p className="mt-1 text-xs text-red-700">{e.last_error}</p> : null}
                  </div>
                ) : (
                  <div className="mt-1">
                    <span className="text-xs font-medium uppercase text-slate-500">Nota interna</span>
                    <p className="mt-1 whitespace-pre-wrap text-slate-800">{e.body}</p>
                    <p className="mt-1 text-xs text-slate-500">{profileLabel(e.author_profile_id, profileNames)}</p>
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
