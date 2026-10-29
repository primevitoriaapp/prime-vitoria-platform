"use client";

import { TopAlertPopover } from "@/components/top-alert-popover";
import { useEffect, useState } from "react";

type Item = { id: string; client_name: string | null; amount: number; due_date: string };
type Bucket = { count: number; total: number; items: Item[] };
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

  const toItems = (b: Bucket) =>
    b.items.map((r) => ({
      key: r.id,
      title: r.client_name ?? "Cliente",
      detail: `Vence ${r.due_date.split("-").reverse().join("/")}`,
      right: fmt(r.amount),
      href: "/finance#recebiveis"
    }));

  return (
    <div className="flex items-center gap-2">
      {alerts.overdue.count > 0 ? (
        <TopAlertPopover
          className="rounded-full border border-red-400 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 motion-safe:animate-pulse"
          label={`${alerts.overdue.count} vencida${alerts.overdue.count > 1 ? "s" : ""} · ${fmt(alerts.overdue.total)}`}
          title="Contas a receber vencidas"
          items={toItems(alerts.overdue)}
          footerHref="/finance#recebiveis"
          footerLabel="Ver todas no Financeiro"
        />
      ) : null}
      {alerts.due_soon.count > 0 ? (
        <TopAlertPopover
          className="rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800"
          label={`${alerts.due_soon.count} vence${alerts.due_soon.count > 1 ? "m" : ""} em até 3 dias · ${fmt(alerts.due_soon.total)}`}
          title="Vencem em até 3 dias"
          items={toItems(alerts.due_soon)}
          footerHref="/finance#recebiveis"
          footerLabel="Ver todas no Financeiro"
        />
      ) : null}
    </div>
  );
}
