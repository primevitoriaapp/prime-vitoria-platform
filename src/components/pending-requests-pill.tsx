"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTenantTableRefresh } from "@/lib/realtime/use-tenant-table-refresh";

/**
 * Topo do painel: pedidos de cliente esperando a central (status "Solicitada").
 * Fica visível (piscando) até alguém aprovar ou atribuir — mesmo que o pedido
 * tenha chegado com o painel fechado.
 */
export function PendingRequestsPill({ tenantId }: { tenantId: string | null }) {
  const [count, setCount] = useState(0);
  const [nextId, setNextId] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ status: "requested", page: "1", pageSize: "1", sortDir: "asc" });
    void fetch(`/api/trips?${qs}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { items?: { id: string }[]; total?: number } }) => {
        if (!json?.success) return;
        setCount(json.data?.total ?? 0);
        setNextId(json.data?.items?.[0]?.id ?? null);
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
    <Link
      href={nextId ? `/agenda?trip=${nextId}` : "/agenda"}
      className="rounded-full border border-amber-500 bg-amber-400 px-3 py-1 text-xs font-bold text-[#111] motion-safe:animate-pulse"
      title="Pedidos de clientes aguardando a central"
    >
      🔔 {count} pedido{count > 1 ? "s" : ""} aguardando
    </Link>
  );
}
