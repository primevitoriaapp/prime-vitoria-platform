"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

type Item = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  tripId: string | null;
  unread: boolean;
  createdAt: string;
};

type Props = {
  tenantId?: string | null;
  devFallbackRole?: "financeiro" | "admin" | "operador";
  compact?: boolean;
};

export function InAppNotificationsPanel({
  tenantId = null,
  devFallbackRole = "financeiro",
  compact = false
}: Props) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const qs = new URLSearchParams({ page: "1", pageSize: compact ? "8" : "25" });
    if (unreadOnly) qs.set("unreadOnly", "true");
    const res = await fetchWithSupabaseSession(`/api/notifications/in-app?${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items: Item[]; total: number; unreadCount: number };
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setItems([]);
      setTotal(0);
      setUnreadCount(0);
      setMessage(json.error?.message ?? "Não foi possível carregar notificações.");
      setLoading(false);
      return;
    }
    setItems(json.data?.items ?? []);
    setTotal(json.data?.total ?? 0);
    setUnreadCount(json.data?.unreadCount ?? 0);
    setLoading(false);
  }, [unreadOnly, devFallbackRole, compact]);

  useEffect(() => {
    void load();
  }, [load]);

  useTenantTableRefresh(tenantId, ["notifications", "notification_jobs"], load);

  async function markRead(id: string) {
    const res = await fetchWithSupabaseSession(
      `/api/notifications/in-app/${id}/read`,
      { method: "POST" },
      devFallbackRole
    );
    if (!res.ok) {
      setMessage("Falha ao marcar como lida.");
      return;
    }
    await load();
  }

  async function markAllRead() {
    const res = await fetchWithSupabaseSession(
      "/api/notifications/in-app/read-all",
      { method: "POST" },
      devFallbackRole
    );
    const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
    if (!res.ok || !json.success) {
      setMessage(json.error?.message ?? "Falha ao marcar todas como lidas.");
      return;
    }
    await load();
  }

  return (
    <section className={`card ${compact ? "mt-4" : "mt-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Notificações
          {unreadCount > 0 ? (
            <span className="ml-2 rounded-full bg-amber-600 px-2 py-0.5 text-xs font-medium text-white">
              {unreadCount}
            </span>
          ) : null}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1 text-slate-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            Só não lidas
          </label>
          {unreadCount > 0 ? (
            <button type="button" className="btn-secondary text-sm" onClick={() => void markAllRead()}>
              Marcar todas lidas
            </button>
          ) : null}
        </div>
      </div>

      {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
      {loading ? <p className="mt-3 text-sm text-slate-500">A carregar…</p> : null}

      {!loading && items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Sem notificações{unreadOnly ? " não lidas" : ""}.</p>
      ) : null}

      <ul className="mt-3 divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.id}
            className={`py-3 text-sm ${item.unread ? "bg-amber-50/50 -mx-2 px-2 rounded" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{item.title}</p>
                <p className="text-slate-600">{item.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short"
                  })}
                </p>
                {item.tripId ? (
                  <Link href={`/agenda?trip=${item.tripId}`} className="mt-1 inline-block text-xs text-amber-700 hover:underline">
                    Ver corrida
                  </Link>
                ) : null}
              </div>
              {item.unread ? (
                <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => void markRead(item.id)}>
                  Marcar lida
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {!compact && total > items.length ? (
        <p className="mt-2 text-xs text-slate-500">A mostrar {items.length} de {total}.</p>
      ) : null}
    </section>
  );
}
