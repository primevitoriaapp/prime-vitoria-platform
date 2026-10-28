"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Bucket = { count: number; total: number };
type Alerts = { overdue: Bucket; due_soon: Bucket };

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Topo do painel: contas a receber vencidas (vermelho piscando) e que vencem em até 3 dias (amarelo). */
export function ReceivablesAlertPill() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/finance/receivables/alerts", { credentials: "include" })
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: Alerts }) => {
          if (!cancelled && json?.success && json.data) setAlerts(json.data);
        })
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!alerts || (alerts.overdue.count === 0 && alerts.due_soon.count === 0)) return null;

  return (
    <div className="flex items-center gap-2">
      {alerts.overdue.count > 0 ? (
        <Link
          href="/finance"
          className="rounded-full border border-red-400 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 motion-safe:animate-pulse"
          title="Contas a receber vencidas"
        >
          {alerts.overdue.count} vencida{alerts.overdue.count > 1 ? "s" : ""} · {fmt(alerts.overdue.total)}
        </Link>
      ) : null}
      {alerts.due_soon.count > 0 ? (
        <Link
          href="/finance"
          className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
          title="Contas a receber que vencem em até 3 dias"
        >
          {alerts.due_soon.count} vence{alerts.due_soon.count > 1 ? "m" : ""} em até 3 dias · {fmt(alerts.due_soon.total)}
        </Link>
      ) : null}
    </div>
  );
}
