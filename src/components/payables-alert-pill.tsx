"use client";

import { useEffect, useState } from "react";
import { TopAlertPopover } from "@/components/top-alert-popover";

type Item = { id: string; description: string; supplier: string | null; amount: number; due_date: string };
type Bucket = { count: number; total: number; items: Item[] };

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Topo do painel: contas da empresa vencidas ou vencendo em até 5 dias. */
export function PayablesAlertPill() {
  const [data, setData] = useState<{ overdue: Bucket; due_soon: Bucket } | null>(null);
  useEffect(() => {
    let off = false;
    const load = () =>
      fetch("/api/finance/company-payables/alerts", { credentials: "include" })
        .then((r) => r.json())
        .then((j: { success?: boolean; data?: { overdue: Bucket; due_soon: Bucket } }) => {
          if (!off && j?.success && j.data) setData(j.data);
        })
        .catch(() => undefined);
    void load();
    const t = window.setInterval(load, 10 * 60_000);
    return () => {
      off = true;
      window.clearInterval(t);
    };
  }, []);
  if (!data) return null;
  const n = data.overdue.count + data.due_soon.count;
  if (n === 0) return null;
  const items = [...data.overdue.items, ...data.due_soon.items].map((r) => ({
    key: r.id,
    title: r.description,
    detail: `${r.due_date < new Date().toISOString().slice(0, 10) ? "Venceu" : "Vence"} ${r.due_date.split("-").reverse().join("/")}${r.supplier ? ` · ${r.supplier}` : ""}`,
    right: fmt(r.amount),
    href: "/contas-a-pagar"
  }));
  return (
    <TopAlertPopover
      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
        data.overdue.count ? "border-red-400 bg-red-50 text-red-700" : "border-amber-400 bg-amber-50 text-amber-800"
      }`}
      label={`A pagar: ${n} · ${fmt(data.overdue.total + data.due_soon.total)}`}
      title="Contas da empresa vencidas ou vencendo em 5 dias"
      items={items}
      footerHref="/contas-a-pagar"
      footerLabel="Abrir contas a pagar"
    />
  );
}
