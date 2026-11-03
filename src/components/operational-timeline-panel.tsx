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
  if (!id) return "automático";
  return names[id]?.trim() || "equipe Prime";
}

export function OperationalTimelinePanel({ tripId, devFallbackRole = "operador" }: Props) {
  const [showNotices, setShowNotices] = useState(false);
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

  const when = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const st = (v: string | null) => (v && v in STATUS_CORRIDA_PT ? STATUS_CORRIDA_PT[v as keyof typeof STATUS_CORRIDA_PT] : (v ?? "—"));
  const SOURCE: Record<string, string> = { driver: "pelo motorista", admin: "pela central", system: "automático", client: "pelo cliente", cron: "automático" };
  const RECIPIENT: Record<string, string> = { driver: "motorista", client: "cliente", staff: "equipe", passenger: "passageiro", profile: "equipe" };
  // "Estado alterado" da auditoria repete a linha de status: mostra só uma vez.
  const visible = items.filter((e) => (showNotices || e.kind !== "notification") && !(e.kind === "audit" && e.action === "trip.status"));
  const notices = items.filter((e) => e.kind === "notification").length;

  return (
    <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-prime-text">Histórico da corrida</h2>
          <p className="mt-0.5 text-sm text-prime-muted">Tudo o que aconteceu, do mais recente para o mais antigo.</p>
        </div>
        <div className="inline-flex rounded-xl bg-[#ECEAE5] p-1 text-sm">
          {(
            [
              ["", "Tudo"],
              ["trip.", "Corrida"],
              ["finance.", "Financeiro"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setAuditFilter(value)}
              className={`rounded-lg px-3 py-1.5 ${auditFilter === value ? "bg-white font-semibold text-prime-text shadow-sm" : "text-[#4A4D55]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <ul className="mt-4 animate-pulse space-y-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <li key={i} className="h-10 rounded-lg bg-prime-bg" />
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
          <button type="button" onClick={() => void load()} className="text-sm font-semibold text-prime-gold-ink underline">
            Tentar de novo
          </button>
        </div>
      ) : null}
      {!loading && !error ? (
        <>
          <ol className="mt-4 max-h-96 overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <li className="text-sm text-prime-muted">Nada registrado ainda.</li>
            ) : (
              visible.map((e) => {
                let title = "";
                let detail: string | null = null;
                let dot = "bg-[#C9A84C]";
                if (e.kind === "audit") {
                  title = timelineAuditLabel(e.action);
                  detail = [profileLabel(e.actor_user_id, profileNames), timelineMetadataSummary(e.metadata)].filter(Boolean).join(" · ") || null;
                } else if (e.kind === "status") {
                  title = `${st(e.to_status)}`;
                  detail = [e.from_status ? `antes: ${st(e.from_status)}` : null, e.source ? (SOURCE[e.source] ?? e.source) : null].filter(Boolean).join(" · ") || null;
                  dot = "bg-[#1A1B1E]";
                } else if (e.kind === "claim") {
                  title = e.action === "assumed" ? "Atendente assumiu a corrida" : "Atendente liberou a corrida";
                  detail = profileLabel(e.operator_profile_id, profileNames);
                } else if (e.kind === "notification") {
                  title = notificationTimelineTitle({ eventType: e.event_type, channel: e.channel }, e.status);
                  detail = `aviso para ${RECIPIENT[e.recipient_type] ?? e.recipient_type}`;
                  dot = e.last_error ? "bg-red-500" : "bg-[#C9C6BE]";
                } else {
                  title = "Nota da equipe";
                  detail = profileLabel(e.author_profile_id, profileNames);
                  dot = "bg-blue-500";
                }
                return (
                  <li key={e.kind === "note" ? `n-${e.id}` : e.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
                    <span className="absolute left-[8px] top-4 h-full w-px bg-prime-border" aria-hidden />
                    <span className={`relative z-[1] mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white ${dot}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[15px] font-medium text-prime-text">{title}</p>
                        <p className="text-xs text-prime-muted">{when(e.at)}</p>
                      </div>
                      {e.kind === "note" ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-prime-text">{e.body}</p> : null}
                      {detail ? <p className="mt-0.5 text-sm text-prime-muted">{detail}</p> : null}
                      {e.kind === "notification" && e.last_error ? <p className="mt-0.5 text-sm text-red-700">Falhou: {e.last_error}</p> : null}
                    </div>
                  </li>
                );
              })
            )}
          </ol>
          {notices > 0 ? (
            <button type="button" onClick={() => setShowNotices((v) => !v)} className="mt-3 text-sm font-semibold text-prime-gold-ink hover:underline">
              {showNotices ? "Esconder avisos enviados" : `Mostrar avisos enviados (${notices})`}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
