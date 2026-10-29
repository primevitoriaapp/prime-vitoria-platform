"use client";

import { TopAlertPopover } from "@/components/top-alert-popover";
import { formatBrDateTime } from "@/lib/dates/br-date";
import { useCallback, useEffect, useState } from "react";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

/**
 * Topo do painel: pedidos de cliente esperando a central (status "Solicitada").
 * Fica visível (piscando) até alguém aprovar ou atribuir — mesmo que o pedido
 * tenha chegado com o painel fechado.
 */
export function PendingRequestsPill({ tenantId }: { tenantId: string | null }) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<{ id: string; scheduled_at: string; client_name?: string | null; passenger_name?: string | null }[]>([]);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ status: "requested", page: "1", pageSize: "10", sortDir: "asc" });
    void fetch(`/api/trips?${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items?: { id: string; scheduled_at: string; client_name?: string | null; passenger_name?: string | null }[]; total?: number } }) => {
        if (!json?.success) return;
        setCount(json.data?.total ?? 0);
        setItems(json.data?.items ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useTenantTableRefresh(tenantId, ["trips"], load);

  if (count === 0) return null;
  return (
    <TopAlertPopover
      className="rounded-full border border-amber-500 bg-amber-400 px-3 py-1 text-xs font-bold text-[#111] motion-safe:animate-pulse"
      label={`🔔 ${count} pedido${count > 1 ? "s" : ""} aguardando`}
      title="Pedidos de clientes aguardando a central"
      items={items.map((t) => ({
        key: t.id,
        title: t.client_name ?? "Cliente",
        detail: `${formatBrDateTime(t.scheduled_at)} · ${t.passenger_name?.trim() || "passageiro a definir"}`,
        href: `/agenda?trip=${t.id}#trip-detail`
      }))}
      footerHref="/agenda?grupo=agendada&periodo=mes"
      footerLabel="Ver todos na Agenda"
    />
  );
}
